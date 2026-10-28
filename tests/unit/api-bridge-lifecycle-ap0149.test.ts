import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
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

test("API bridge drain initiates admission stop when called directly", async () => {
  const server = http.createServer((_req, res) => res.end("ok"));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  const globalState = globalThis as typeof globalThis & {
    __agentproxyApiBridgeServer?: http.Server;
    __agentproxyApiBridgeStarted?: boolean;
  };
  globalState.__agentproxyApiBridgeServer = server;
  globalState.__agentproxyApiBridgeStarted = true;

  try {
    await bridge.drainApiBridgeServer();
    assert.equal(server.listening, false, "drain must stop a still-listening bridge itself");
    assert.equal(globalState.__agentproxyApiBridgeServer, undefined);
    assert.equal(globalState.__agentproxyApiBridgeStarted, false);
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    globalState.__agentproxyApiBridgeServer = undefined;
    globalState.__agentproxyApiBridgeStarted = false;
  }
});
test("API bridge stop closes upgraded relay sockets before drain completes", async () => {
  let upstreamSocket: net.Socket | undefined;
  let markUpgradeReady!: () => void;
  const upgradeReady = new Promise<void>((resolve) => {
    markUpgradeReady = resolve;
  });
  const dashboard = net.createServer((socket) => {
    upstreamSocket = socket;
    socket.once("data", () => {
      socket.write(
        "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n"
      );
    });
  });
  await new Promise<void>((resolve) => dashboard.listen(0, "127.0.0.1", resolve));
  const dashboardAddress = dashboard.address();
  assert.ok(dashboardAddress && typeof dashboardAddress === "object");

  const server = bridge.createApiBridgeServer(dashboardAddress.port);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const bridgeAddress = server.address();
  assert.ok(bridgeAddress && typeof bridgeAddress === "object");

  const globalState = globalThis as typeof globalThis & {
    __agentproxyApiBridgeServer?: http.Server;
    __agentproxyApiBridgeStarted?: boolean;
  };
  globalState.__agentproxyApiBridgeServer = server;
  globalState.__agentproxyApiBridgeStarted = true;

  const client = net.connect(bridgeAddress.port, "127.0.0.1");
  const clientClosed = new Promise<void>((resolve) => client.once("close", () => resolve()));
  client.once("data", () => markUpgradeReady());
  client.write(
    "GET /v1/chat/completions HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n"
  );

  try {
    await upgradeReady;
    assert.equal(client.destroyed, false, "fixture must hold an active upgraded relay");

    bridge.stopApiBridgeServer();
    const draining = bridge.drainApiBridgeServer();
    const drainedWithinBound = await Promise.race([
      draining.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1_000)),
    ]);

    assert.equal(drainedWithinBound, true, "an upgraded relay must not hold bridge drain open");
    const clientClosedWithinBound = await Promise.race([
      clientClosed.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1_000)),
    ]);
    assert.equal(clientClosedWithinBound, true, "shutdown must close upgraded client relays");
  } finally {
    client.destroy();
    upstreamSocket?.destroy();
    if (server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await bridge.drainApiBridgeServer().catch(() => undefined);
    await new Promise<void>((resolve) => dashboard.close(() => resolve()));
    globalState.__agentproxyApiBridgeServer = undefined;
    globalState.__agentproxyApiBridgeStarted = false;
  }
});
