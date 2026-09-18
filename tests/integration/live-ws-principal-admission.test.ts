import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import net from "node:net";
import test from "node:test";
import { SignJWT } from "jose";
import WebSocket from "ws";

const PER_PRINCIPAL_LIMIT = 20;

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
    }, 90_000);

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

function connectWithApiKey(port: number, apiKey: string, origin: string): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${port}/live-ws`, {
    headers: { Authorization: `Bearer ${apiKey}`, Origin: origin },
  });
}

function connectWithCookie(port: number, cookieToken: string, origin: string): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${port}/live-ws`, {
    headers: { Cookie: `auth_token=${encodeURIComponent(cookieToken)}`, Origin: origin },
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

function waitForClose(
  ws: WebSocket,
  output: () => string
): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timed out waiting for WebSocket close. Output:\n${output()}`)),
      5_000
    );
    ws.once("close", (code, reason) => {
      clearTimeout(timeout);
      resolve({ code, reason: reason.toString() });
    });
    ws.once("error", () => {});
  });
}

test(
  "LiveWS caps one authenticated principal without denying an independent principal",
  { timeout: 150_000 },
  async () => {
    const port = await getFreePort();
    const apiKey = "test-live-ws-principal-admission-key";
    const jwtSecret = "test-live-ws-principal-admission-jwt";
    const allowedOrigin = "http://localhost";
    let output = "";

    const child = spawn(process.execPath, ["scripts/start-ws-server.mjs"], {
      cwd: process.cwd(),
      detached: process.platform !== "win32",
      env: {
        ...process.env,
        NODE_ENV: "test",
        OMNIROUTE_API_KEY: apiKey,
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

    const sockets: WebSocket[] = [];
    try {
      await waitForStartup(child, () => output);

      for (let i = 0; i < PER_PRINCIPAL_LIMIT; i++) {
        const ws = connectWithApiKey(port, apiKey, allowedOrigin);
        sockets.push(ws);
        await waitForOpen(ws, () => output);
      }

      const rejected = connectWithApiKey(port, apiKey, allowedOrigin);
      sockets.push(rejected);
      const rejectedClose = waitForClose(rejected, () => output);
      await waitForOpen(rejected, () => output);
      const close = await rejectedClose;
      assert.equal(close.code, 1013);
      assert.match(close.reason, /principal/i);

      const cookieToken = await new SignJWT({ role: "dashboard" })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject("independent-dashboard-user")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(new TextEncoder().encode(jwtSecret));

      const independent = connectWithCookie(port, cookieToken, allowedOrigin);
      sockets.push(independent);
      await waitForOpen(independent, () => output);
      assert.equal(independent.readyState, WebSocket.OPEN);
      assert.equal(child.exitCode, null, `LiveWS process crashed. Output:\n${output}`);
    } finally {
      for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.terminate();
        }
      }
      terminateTree(child);
    }
  }
);
