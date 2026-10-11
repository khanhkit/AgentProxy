import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

const bridge = await import("../../src/lib/apiBridgeServer.ts");

test("API bridge stop closes admission while drain waits for active relay completion", async () => {
  assert.equal(
    typeof (bridge as { drainApiBridgeServer?: unknown }).drainApiBridgeServer,
    "function"
  );
  const drainApiBridgeServer = (bridge as unknown as { drainApiBridgeServer: () => Promise<void> })
    .drainApiBridgeServer;

  let activeResponse!: http.ServerResponse;
  let markActive!: () => void;
  const active = new Promise<void>((resolve) => {
    markActive = resolve;
  });
  const server = http.createServer((_req, res) => {
    activeResponse = res;
    res.writeHead(200, { "content-type": "text/plain" });
    res.write("active");
    markActive();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");

  const globalState = globalThis as typeof globalThis & {
    __agentproxyApiBridgeServer?: http.Server;
    __agentproxyApiBridgeStarted?: boolean;
  };
  globalState.__agentproxyApiBridgeServer = server;
  globalState.__agentproxyApiBridgeStarted = true;

  const request = http.get({ host: "127.0.0.1", port: address.port, path: "/" });
  request.on("error", () => {});
  await active;

  bridge.stopApiBridgeServer();
  let drained = false;
  const draining = drainApiBridgeServer().then(() => {
    drained = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(drained, false, "active relay must keep the drain pending");
  assert.equal(
    globalState.__agentproxyApiBridgeServer,
    server,
    "closing server remains authoritative until its close callback"
  );
  assert.equal(
    globalState.__agentproxyApiBridgeStarted,
    false,
    "new admission is stopped immediately"
  );

  activeResponse.end();
  await draining;
  request.destroy();
  assert.equal(globalState.__agentproxyApiBridgeServer, undefined);
});
