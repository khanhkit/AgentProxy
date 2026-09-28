import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import tls from "node:tls";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";

import { generateMitmCa } from "../../src/mitm/tproxy/dynamicCert.ts";
import { startHttpProxyServer } from "../../src/mitm/inspector/httpProxyServer.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverPath = path.join(repoRoot, "src", "mitm", "server.cjs");

async function listenLoopback(server: net.Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return address.port;
}

async function closeServer(server: net.Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function readHeaders(socket: net.Socket | tls.TLSSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    const timer = setTimeout(
      () => reject(new Error(`timed out waiting for CONNECT response: ${data}`)),
      2000
    );
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      data += chunk;
      if (data.includes("\r\n\r\n")) {
        clearTimeout(timer);
        resolve(data);
      }
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function startStandaloneMitm(): Promise<{
  child: ChildProcessWithoutNullStreams;
  port: number;
  dataDir: string;
  logs: () => string;
}> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-connect-policy-"));
  const certDir = path.join(dataDir, "mitm");
  fs.mkdirSync(certDir, { recursive: true });
  const ca = await generateMitmCa("AgentProxy CONNECT egress policy test");
  fs.writeFileSync(path.join(certDir, "server.key"), ca.key);
  fs.writeFileSync(path.join(certDir, "server.crt"), ca.cert);

  const probe = net.createServer();
  const port = await listenLoopback(probe);
  await closeServer(probe);

  const child = spawn(process.execPath, [serverPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      ROUTER_API_KEY: "test-router-key",
      MITM_LOCAL_PORT: String(port),
      MITM_CERT_MODE: "legacy",
      MITM_VERBOSE: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`MITM readiness timeout: ${output}`)), 5000);
    const inspect = () => {
      if (output.includes("MITM ready on")) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", inspect);
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      reject(new Error(`MITM exited before ready (code=${code}, signal=${signal}): ${output}`));
    });
  });

  return { child, port, dataDir, logs: () => output };
}

async function stopStandaloneMitm(fixture: {
  child: ChildProcessWithoutNullStreams;
  dataDir: string;
}): Promise<void> {
  if (fixture.child.exitCode === null && fixture.child.signalCode === null) {
    fixture.child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        fixture.child.kill("SIGKILL");
        resolve();
      }, 1500);
      fixture.child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  fs.rmSync(fixture.dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
}

test("AP-ISS-0038 system HTTP proxy rejects local/disallowed CONNECT before upstream socket creation", async () => {
  let targetConnections = 0;
  const target = net.createServer((socket) => {
    targetConnections++;
    socket.destroy();
  });
  const targetPort = await listenLoopback(target);
  const proxy = await startHttpProxyServer(0);
  const client = net.createConnection({ host: "127.0.0.1", port: proxy.port });

  try {
    await new Promise<void>((resolve, reject) => {
      client.once("connect", () => resolve());
      client.once("error", reject);
    });
    client.write(
      `CONNECT 127.0.0.1:${targetPort} HTTP/1.1\r\nHost: 127.0.0.1:${targetPort}\r\n\r\n`
    );
    const response = await readHeaders(client);
    assert.match(response, /^HTTP\/1\.1 403 /);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(
      targetConnections,
      0,
      "policy denial must happen before net.connect reaches target"
    );
  } finally {
    client.destroy();
    await proxy.stop();
    await closeServer(target);
  }
});

test("AP-ISS-0038 standalone MITM rejects local/disallowed CONNECT before upstream socket creation", async () => {
  let targetConnections = 0;
  const target = net.createServer((socket) => {
    targetConnections++;
    socket.destroy();
  });
  const targetPort = await listenLoopback(target);
  const fixture = await startStandaloneMitm();
  const client = tls.connect({
    host: "127.0.0.1",
    port: fixture.port,
    rejectUnauthorized: false,
  });

  try {
    await new Promise<void>((resolve, reject) => {
      client.once("secureConnect", () => resolve());
      client.once("error", reject);
    });
    client.write(
      `CONNECT 127.0.0.1:${targetPort} HTTP/1.1\r\nHost: 127.0.0.1:${targetPort}\r\n\r\n`
    );
    const response = await readHeaders(client);
    assert.match(response, /^HTTP\/1\.1 403 /, `child output: ${fixture.logs()}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(
      targetConnections,
      0,
      "policy denial must happen before net.connect reaches target"
    );
  } finally {
    client.destroy();
    await stopStandaloneMitm(fixture);
    await closeServer(target);
  }
});
