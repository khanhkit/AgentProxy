import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import net from "node:net";
import test from "node:test";
import WebSocket from "ws";

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("Failed to allocate a local port"));
      });
    });
  });
}

function terminateTree(child: ChildProcessWithoutNullStreams): void {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

function waitForStartup(
  child: ChildProcessWithoutNullStreams,
  getOutput: () => string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`LiveWS startup timed out. Output:\n${getOutput()}`));
    }, 30_000);

    const onData = () => {
      if (getOutput().includes("Dashboard WebSocket server listening")) {
        cleanup();
        resolve();
      }
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();
      reject(
        new Error(`LiveWS exited before listening: code=${code} signal=${signal}\n${getOutput()}`)
      );
    };
    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout.off("data", onData);
      child.stderr.off("data", onData);
      child.off("exit", onExit);
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("exit", onExit);
    onData();
  });
}

function connect(port: number, apiKey: string, origin: string): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${port}/live-ws`, {
    headers: { Authorization: `Bearer ${apiKey}`, Origin: origin },
  });
}

function waitForOpen(ws: WebSocket, output: () => string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timed out waiting for WebSocket open. Output:\n${output()}`)),
      5_000
    );
    ws.once("open", () => {
      clearTimeout(timeout);
      resolve();
    });
    ws.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function waitForClose(ws: WebSocket, output: () => string): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timed out waiting for WebSocket close. Output:\n${output()}`)),
      5_000
    );
    ws.once("close", (code, reason) => {
      clearTimeout(timeout);
      resolve({ code, reason: reason.toString() });
    });
    ws.once("error", () => {
      // Protocol/size enforcement can surface an error before the close frame.
      // The close event remains the authoritative assertion below.
    });
  });
}

function waitForMessageType(
  ws: WebSocket,
  type: string,
  output: () => string
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timed out waiting for ${type}. Output:\n${output()}`)),
      5_000
    );
    const onMessage = (data: WebSocket.RawData) => {
      const parsed = JSON.parse(data.toString()) as Record<string, unknown>;
      if (parsed.type === type) {
        clearTimeout(timeout);
        ws.off("message", onMessage);
        resolve(parsed);
      }
    };
    ws.on("message", onMessage);
  });
}

test(
  "LiveWS rejects cross-origin upgrades before 101 and isolates malformed/oversized messages",
  { timeout: 55_000 },
  async () => {
    const port = await getFreePort();
    const apiKey = "test-live-ws-ingress-security-key";
    const jwtSecret = "test-live-ws-ingress-security-jwt";
    const allowedOrigin = "http://localhost";
    let output = "";

    const child = spawn(process.execPath, ["scripts/start-ws-server.mjs"], {
      cwd: process.cwd(),
      detached: process.platform !== "win32",
      env: {
        ...process.env,
        NODE_ENV: "test",
        AGENTPROXY_API_KEY: apiKey,
        JWT_SECRET: jwtSecret,
        LIVE_WS_HOST: "127.0.0.1",
        LIVE_WS_PORT: String(port),
        LIVE_WS_ALLOWED_ORIGINS: allowedOrigin,
      },
    });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));

    try {
      await waitForStartup(child, () => output);

      await new Promise<void>((resolve, reject) => {
        const ws = connect(port, apiKey, "https://attacker.invalid");
        const timeout = setTimeout(() => {
          ws.terminate();
          reject(new Error(`Timed out waiting for HTTP upgrade rejection. Output:\n${output}`));
        }, 5_000);

        ws.once("unexpected-response", (_request, response) => {
          clearTimeout(timeout);
          assert.equal(response.statusCode, 403);
          ws.terminate();
          resolve();
        });
        ws.once("open", () => {
          clearTimeout(timeout);
          ws.close();
          reject(new Error("Cross-origin client received HTTP 101 before being rejected"));
        });
        ws.once("error", () => {
          // ws may emit an error around an intentionally rejected handshake; the
          // unexpected-response status is the required evidence.
        });
      });

      await new Promise<void>((resolve, reject) => {
        const ws = connect(port, "invalid-live-ws-key", allowedOrigin);
        const timeout = setTimeout(() => {
          ws.terminate();
          reject(new Error(`Timed out waiting for HTTP auth rejection. Output:\n${output}`));
        }, 5_000);

        ws.once("unexpected-response", (_request, response) => {
          clearTimeout(timeout);
          assert.equal(response.statusCode, 401);
          ws.terminate();
          resolve();
        });
        ws.once("open", () => {
          clearTimeout(timeout);
          ws.close();
          reject(new Error("Unauthorized client received HTTP 101 before being rejected"));
        });
        ws.once("error", () => {});
      });

      const malformed = connect(port, apiKey, allowedOrigin);
      await waitForOpen(malformed, () => output);
      malformed.send(JSON.stringify({ type: "subscribe", channels: 42 }));
      const malformedClose = await waitForClose(malformed, () => output);
      assert.equal(malformedClose.code, 1008);

      // The malformed client must not destabilize the server or another client.
      const valid = connect(port, apiKey, allowedOrigin);
      await waitForOpen(valid, () => output);
      const welcomePromise = waitForMessageType(valid, "welcome", () => output);
      valid.send(JSON.stringify({ type: "subscribe", channels: ["requests"] }));
      const welcome = await welcomePromise;
      assert.deepEqual(welcome.channels, ["requests"]);
      valid.close(1000);

      const oversized = connect(port, apiKey, allowedOrigin);
      await waitForOpen(oversized, () => output);
      oversized.send(JSON.stringify({ type: "ping", padding: "x".repeat(20_000) }));
      const oversizedClose = await waitForClose(oversized, () => output);
      assert.equal(oversizedClose.code, 1009);

      assert.equal(child.exitCode, null, `LiveWS process crashed. Output:\n${output}`);
    } finally {
      terminateTree(child);
    }
  }
);
