import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

const { createAgentProxyWsBridge } = await import("../../scripts/dev/v1-ws-bridge.mjs");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

function close(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function waitFor(predicate, { timeoutMs = 3000, intervalMs = 10 } = {}) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      try {
        const value = predicate();
        if (value) {
          clearInterval(timer);
          resolve(value);
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          clearInterval(timer);
          reject(new Error("Timed out waiting for condition"));
        }
      } catch (error: any) {
        clearInterval(timer);
        reject(error);
      }
    }, intervalMs);
  });
}

test("v1 ws bridge streams correlated request chunks and survives protocol errors", async () => {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (url.pathname === "/api/v1/ws" && url.searchParams.get("handshake") === "1") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, path: "/v1/ws", wsAuth: false, authenticated: false }));
      return;
    }

    if (url.pathname === "/v1/chat/completions" || url.pathname === "/v1/messages") {
      const body = JSON.parse(((await readRequestBody(req)) as any) || "{}");
      const firstMessage = Array.isArray(body.messages) ? body.messages[0] : null;
      const content = typeof firstMessage?.content === "string" ? firstMessage.content : body.model;

      res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8" });
      res.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: `${content}:part1` } }] })}\n\n`
      );
      setTimeout(() => {
        res.write(
          `data: ${JSON.stringify({ choices: [{ delta: { content: `${content}:part2` } }] })}\n\n`
        );
        res.end("data: [DONE]\n\n");
      }, 10);
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  });

  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  const bridge = createAgentProxyWsBridge({ baseUrl, pingIntervalMs: 1000, idleTimeoutMs: 10000 });

  server.on("upgrade", async (req, socket, head) => {
    const handled = await bridge.handleUpgrade(req, socket, head);
    if (!handled && !socket.destroyed) {
      socket.destroy();
    }
  });

  const ws = new WebSocket(`ws://127.0.0.1:${port}/v1/ws`);
  const messages = [];
  const errors = [];
  ws.addEventListener("message", (event) => {
    messages.push(JSON.parse(String(event.data)));
  });
  ws.addEventListener("error", (event) => {
    errors.push(event);
  });

  await waitFor(() => messages.find((entry) => entry.type === "session.ready"));

  ws.send("{bad json");
  await waitFor(() => messages.find((entry) => entry.type === "protocol.error"));
  assert.equal(ws.readyState, WebSocket.OPEN);

  ws.send(
    JSON.stringify({
      type: "request",
      id: "req-1",
      payload: {
        model: "openai/gpt-4.1-mini",
        messages: [{ role: "user", content: "alpha" }],
      },
    })
  );
  ws.send(
    JSON.stringify({
      type: "request",
      id: "req-2",
      endpoint: "/v1/messages",
      payload: {
        model: "anthropic/claude-3.7-sonnet",
        messages: [{ role: "user", content: "beta" }],
      },
    })
  );

  await waitFor(() => {
    const completedIds = messages
      .filter((entry) => entry.type === "response.completed")
      .map((entry) => entry.id);
    return completedIds.includes("req-1") && completedIds.includes("req-2");
  });

  const req1Chunks = messages
    .filter((entry) => entry.type === "response.chunk" && entry.id === "req-1")
    .map((entry) => entry.chunk);
  const req2Chunks = messages
    .filter((entry) => entry.type === "response.chunk" && entry.id === "req-2")
    .map((entry) => entry.chunk);

  assert.equal(errors.length, 0);
  const req1Combined = req1Chunks.join("");
  const req2Combined = req2Chunks.join("");
  assert.match(req1Combined, /alpha:part1/);
  assert.match(req1Combined, /alpha:part2/);
  assert.match(req2Combined, /beta:part1/);
  assert.match(req2Combined, /beta:part2/);

  ws.close();
  await close(server);
});

test("v1 ws bridge upgrade failures never expose exception text", async () => {
  const leak = "ENOENT /home/operator/private.txt\n at secret (/srv/app.js:1:1)";
  const bridge = createAgentProxyWsBridge({
    baseUrl: "http://127.0.0.1:1",
    fetchImpl: async () => {
      throw new Error(leak);
    },
  });
  const socket = {
    writable: true,
    destroyed: false,
    written: "",
    write(chunk) {
      this.written += String(chunk);
      return true;
    },
    end(chunk) {
      if (chunk) this.written += String(chunk);
      this.writable = false;
    },
    destroy() {
      this.destroyed = true;
    },
    on() {},
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    const handled = await bridge.handleUpgrade(
      {
        url: "/v1/ws",
        headers: { upgrade: "websocket", "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==" },
        socket: { remoteAddress: "127.0.0.1" },
      },
      socket,
      Buffer.alloc(0)
    );
    assert.equal(handled, true);
    assert.match(socket.written, /websocket_bridge_failed/);
    assert.match(socket.written, /WebSocket bridge failed/);
    assert.doesNotMatch(socket.written, /home\/operator|\/srv\/app\.js|ENOENT/);
  } finally {
    console.error = originalError;
  }
});
