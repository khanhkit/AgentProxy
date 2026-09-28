import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";

import {
  applyCustomHttpServerTimeouts,
  DEFAULT_CUSTOM_HTTP_SERVER_TIMEOUTS,
  type CustomHttpServerTimeoutPolicy,
} from "../../src/shared/utils/runtimeTimeouts.ts";

const openServers = new Set<http.Server>();
const openSockets = new Set<net.Socket>();

function closeServer(server: http.Server): Promise<void> {
  openServers.delete(server);
  return new Promise((resolve) => server.close(() => resolve()));
}

function destroySocket(socket: net.Socket): void {
  openSockets.delete(socket);
  socket.destroy();
}

afterEach(async () => {
  for (const socket of openSockets) socket.destroy();
  openSockets.clear();
  await Promise.all(
    [...openServers].map((server) => new Promise<void>((resolve) => server.close(() => resolve())))
  );
  openServers.clear();
});

async function listen(server: http.Server): Promise<number> {
  openServers.add(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return address.port;
}

function connect(port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    openSockets.add(socket);
    socket.once("connect", () => resolve(socket));
    socket.once("error", reject);
  });
}

function waitForCloseOrResponse(socket: net.Socket, timeoutMs = 1_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = "";
    const timer = setTimeout(() => reject(new Error("slow client was not terminated")), timeoutMs);
    const done = () => {
      clearTimeout(timer);
      openSockets.delete(socket);
      resolve(raw);
    };
    socket.on("data", (chunk) => {
      raw += chunk.toString("utf8");
    });
    socket.once("end", done);
    socket.once("close", done);
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

const FAST_POLICY: CustomHttpServerTimeoutPolicy = {
  requestTimeoutMs: 140,
  headersTimeoutMs: 100,
  keepAliveTimeoutMs: 40,
};

test("AP-ISS-0036: default custom HTTP timeout policy is finite and coherent", () => {
  assert.ok(DEFAULT_CUSTOM_HTTP_SERVER_TIMEOUTS.requestTimeoutMs > 0);
  assert.ok(DEFAULT_CUSTOM_HTTP_SERVER_TIMEOUTS.headersTimeoutMs > 0);
  assert.ok(DEFAULT_CUSTOM_HTTP_SERVER_TIMEOUTS.keepAliveTimeoutMs > 0);
  assert.ok(
    DEFAULT_CUSTOM_HTTP_SERVER_TIMEOUTS.headersTimeoutMs >
      DEFAULT_CUSTOM_HTTP_SERVER_TIMEOUTS.keepAliveTimeoutMs
  );
});

test("AP-ISS-0036: policy is applied to the real Node http.Server properties", () => {
  const server = http.createServer();
  applyCustomHttpServerTimeouts(server, FAST_POLICY);
  assert.equal(server.requestTimeout, FAST_POLICY.requestTimeoutMs);
  assert.equal(server.headersTimeout, FAST_POLICY.headersTimeoutMs);
  assert.equal(server.keepAliveTimeout, FAST_POLICY.keepAliveTimeoutMs);
});

test("AP-ISS-0036: slow headers are terminated by an explicit bounded policy", async () => {
  const server = http.createServer({ connectionsCheckingInterval: 20 }, (_req, res) =>
    res.end("ok")
  );
  applyCustomHttpServerTimeouts(server, FAST_POLICY);
  const port = await listen(server);
  const socket = await connect(port);
  socket.write("GET / HTTP/1.1\r\nHost: 127.0.0.1");
  const raw = await waitForCloseOrResponse(socket);
  assert.match(raw, /HTTP\/1\.1 408|^$/);
  await closeServer(server);
});

test("AP-ISS-0036: slow request bodies are terminated by requestTimeout", async () => {
  const server = http.createServer({ connectionsCheckingInterval: 20 }, (req, res) => {
    req.resume();
    req.once("end", () => res.end("ok"));
  });
  applyCustomHttpServerTimeouts(server, FAST_POLICY);
  const port = await listen(server);
  const socket = await connect(port);
  socket.write(
    "POST / HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 10\r\nConnection: close\r\n\r\nx"
  );
  const raw = await waitForCloseOrResponse(socket);
  assert.match(raw, /HTTP\/1\.1 408|^$/);
  await closeServer(server);
});

test("AP-ISS-0036: upgraded WebSocket-style connections survive request timeout", async () => {
  const server = http.createServer({ connectionsCheckingInterval: 20 });
  applyCustomHttpServerTimeouts(server, FAST_POLICY);
  let upgradedSocket: net.Socket | null = null;
  server.on("upgrade", (_req, socket) => {
    upgradedSocket = socket;
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n"
    );
  });
  const port = await listen(server);
  const socket = await connect(port);
  socket.write(
    "GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n"
  );
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, FAST_POLICY.requestTimeoutMs * 2);
    socket.once("error", reject);
    socket.once("close", () => reject(new Error("upgraded socket closed by HTTP timeout policy")));
    socket.once("data", (chunk) => {
      if (!chunk.toString("utf8").includes("101 Switching Protocols")) {
        clearTimeout(timer);
        reject(new Error("upgrade handshake did not complete"));
      }
    });
  });
  assert.equal(socket.destroyed, false);
  destroySocket(socket);
  upgradedSocket?.destroy();
  await closeServer(server);
});

test("AP-ISS-0036: externally reachable custom listeners wire the shared policy", () => {
  const root = process.cwd();
  const files = [
    "src/server/ws/liveServer.ts",
    "src/lib/services/embedWsProxy.ts",
    "src/lib/oauth/utils/server.ts",
  ];
  for (const relative of files) {
    const source = fs.readFileSync(path.join(root, relative), "utf8");
    assert.match(
      source,
      /applyCustomHttpServerTimeouts\(server\)/,
      `${relative} must apply the shared custom HTTP slow-client timeout policy`
    );
  }
});
