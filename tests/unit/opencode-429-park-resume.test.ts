import { describe, it, beforeEach, afterEach, before, after } from "node:test";
import assert from "node:assert";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OpencodeExecutor } from "../../open-sse/executors/opencode.ts";
import type { ExecutorLog, ProviderCredentials } from "../../open-sse/executors/base.ts";
import { resolveProxyForRequest } from "../../open-sse/utils/proxyFetch.ts";
import {
  BURST_PARK_THRESHOLD,
  runParkAndReplay,
} from "../../open-sse/executors/opencodeParkResume.ts";
import * as throttle from "../../open-sse/executors/opencodeEgressThrottle.ts";
import { __resetProxyRefusalMemoryForTesting } from "../../open-sse/utils/proxyRefusalMemory.ts";

const FLAG = "OPENCODE_PARK_AND_RESUME";
const MARKER_ENV = "OPENCODE_POOL_STRAIN_MARKER_PATH";

const log: ExecutorLog = { debug() {}, info() {}, warn() {}, error() {} };
const FPS = ["p", "q", "r", "s", "t", "u", "v", "w"].map((c) => c.repeat(32));

const servers: net.Server[] = [];
const ports: number[] = [];

function listen(server: net.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve((server.address() as net.AddressInfo).port));
  });
}

before(async () => {
  for (let i = 0; i < FPS.length; i++) {
    const server = net.createServer((s) => s.destroy());
    servers.push(server);
    ports.push(await listen(server));
  }
});

after(() => {
  servers.forEach((s) => s.close());
});

function credentialsFor(count: number): ProviderCredentials {
  const fingerprints = FPS.slice(0, count);
  return {
    apiKey: null,
    accessToken: null,
    connectionId: "noauth",
    providerSpecificData: {
      fingerprints,
      accountProxies: fingerprints.map((fp, i) => ({
        fingerprint: fp,
        proxy: { type: "http", host: "127.0.0.1", port: ports[i] },
      })),
    },
  };
}

const BURST_BODY = JSON.stringify({ error: { message: "upstream busy, try again" } });

describe("opencode 429 park-and-resume", () => {
  let originalFetch: typeof globalThis.fetch;
  let priorFlag: string | undefined;
  let priorMarker: string | undefined;
  let observed: string[];
  let markerDir: string;

  beforeEach(() => {
    __resetProxyRefusalMemoryForTesting();
    throttle._clearEgressThrottleForTest();
    originalFetch = globalThis.fetch;
    priorFlag = process.env[FLAG];
    priorMarker = process.env[MARKER_ENV];
    process.env[FLAG] = "true";
    observed = [];
    markerDir = fs.mkdtempSync(path.join(os.tmpdir(), "park-resume-"));
    process.env[MARKER_ENV] = path.join(markerDir, "strain.json");
  });

  afterEach(() => {
    throttle._clearEgressThrottleForTest();
    delete process.env.OPENCODE_EGRESS_THROTTLE_ENABLED;
    delete process.env.OPENCODE_EGRESS_THROTTLE_FLEET_THRESHOLD;
    delete process.env.OPENCODE_EGRESS_THROTTLE_SUSPECT_SLOTS;
    globalThis.fetch = originalFetch;
    if (priorFlag === undefined) delete process.env[FLAG];
    else process.env[FLAG] = priorFlag;
    if (priorMarker === undefined) delete process.env[MARKER_ENV];
    else process.env[MARKER_ENV] = priorMarker;
    fs.rmSync(markerDir, { recursive: true, force: true });
  });

  function installFetch(plan: Array<{ status: number; body?: string }>) {
    let call = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const resolved = resolveProxyForRequest(url);
      observed.push(resolved.proxyUrl ? new URL(resolved.proxyUrl).port : "direct");
      const step = plan[Math.min(call, plan.length - 1)];
      call++;
      return new Response(step.body ?? JSON.stringify({ ok: step.status === 200 }), {
        status: step.status,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof globalThis.fetch;
  }

  function writeMarker(payload: Record<string, unknown>): void {
    fs.writeFileSync(process.env[MARKER_ENV] as string, JSON.stringify(payload));
  }

  async function run(count: number, stream: boolean, signal: AbortSignal | null = null) {
    const exec = new OpencodeExecutor("opencode-zen");
    exec.parkSleep = async () => true;
    return exec.execute({
      model: "muse-spark-1.3-contributor-free",
      body: { messages: [{ role: "user", content: "hi" }], stream: false },
      stream,
      signal,
      credentials: credentialsFor(count),
      log,
    });
  }

  it("below the threshold the wave stays normal with no park", async () => {
    installFetch(
      Array.from({ length: BURST_PARK_THRESHOLD - 1 }, () => ({ status: 429, body: BURST_BODY }))
    );
    const result = await run(BURST_PARK_THRESHOLD - 1, false);
    assert.strictEqual((result as { response: Response }).response.status, 429);
    assert.strictEqual(observed.length, BURST_PARK_THRESHOLD - 1);
    const text = await (result as { response: Response }).response.text();
    assert.ok(!text.includes(":ping"), "no heartbeat below the threshold");
  });

  it("at the threshold it parks once with a heartbeat then replays one capped leg", async () => {
    installFetch([
      ...Array.from({ length: BURST_PARK_THRESHOLD }, () => ({ status: 429, body: BURST_BODY })),
      { status: 200 },
    ]);
    const warnings: string[] = [];
    const loud: ExecutorLog = { ...log, warn: (...a: unknown[]) => void warnings.push(String(a)) };
    const exec = new OpencodeExecutor("opencode-zen");
    exec.parkSleep = async () => true;
    const result = await exec.execute({
      model: "muse-spark-1.3-contributor-free",
      body: { messages: [{ role: "user", content: "hi" }], stream: false },
      stream: true,
      signal: null,
      credentials: credentialsFor(BURST_PARK_THRESHOLD + 1),
      log: loud,
    });
    const response = (result as { response: Response }).response;
    assert.strictEqual(response.status, 200);
    assert.ok(response.headers.get("content-type")?.includes("text/event-stream"));
    const text = await response.text();
    assert.ok(text.includes(":ping"), "heartbeat precedes the replayed leg");
    assert.ok(
      observed.length <= BURST_PARK_THRESHOLD + 3,
      `replay leg capped (saw ${observed.length})`
    );
    assert.ok(
      warnings.some((w) => w.includes("burstStreak") && w.includes("freshD2")),
      "park decision logged with its inputs"
    );
  });

  it("a failed replay after heartbeat emits a sanitized SSE error frame", async () => {
    const hostile = JSON.stringify({
      error: {
        message: "rate limited access_token=park-secret at /srv/private/provider.ts",
        code: "rate_limit_exceeded",
        status: 429,
        internal: "must-not-cross",
      },
    });
    installFetch(
      Array.from({ length: BURST_PARK_THRESHOLD + 3 }, () => ({ status: 429, body: hostile }))
    );

    const result = await run(BURST_PARK_THRESHOLD + 1, true);
    const response = (result as { response: Response }).response;
    assert.strictEqual(response.status, 200, "heartbeat already committed the streaming status");
    assert.ok(response.headers.get("content-type")?.includes("text/event-stream"));

    const text = await response.text();
    assert.ok(text.startsWith(":ping\n\n"), "park heartbeat remains the first SSE frame");
    const dataLines = text
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => line.slice(6));
    assert.ok(
      dataLines.length >= 2,
      "failed replay must emit an error data frame and terminal marker"
    );
    assert.equal(dataLines.at(-1), "[DONE]");

    const errorFrame = JSON.parse(dataLines[0]) as {
      error?: { message?: string; code?: string; status?: number };
    };
    assert.ok(errorFrame.error, "failed replay must expose a protocol error envelope");
    assert.match(errorFrame.error?.message ?? "", /^Upstream replay failed \(429\)$/u);
    assert.doesNotMatch(text, /park-secret|srv\/private|provider\.ts|must-not-cross/u);
  });

  it("failed replay never publishes upstream body text and does not wait on a stalled failure body", async () => {
    let upstreamCancelled = false;
    const hostilePrefix = "<html>internal shard-alpha access_token=park-secret";
    const failedBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(hostilePrefix));
      },
      pull() {
        return new Promise<void>(() => {});
      },
      cancel() {
        upstreamCancelled = true;
      },
    });
    const account = {
      fingerprint: "x".repeat(32),
      cooldownUntil: 0,
      consecutiveFails: 0,
      proxy: null,
    };
    const driver = {
      accounts: [account],
      execute: async () => ({
        response: new Response(failedBody, {
          status: 503,
          headers: { "Content-Type": "text/html" },
        }),
      }),
      markCooldown() {},
      markSuccess() {},
      sleep: async () => true,
    };
    const input = {
      model: "muse-spark-1.3-contributor-free",
      body: { messages: [{ role: "user", content: "hi" }] },
      stream: true,
      signal: null,
      credentials: credentialsFor(1),
      log,
    };
    const fallback = { response: new Response(BURST_BODY, { status: 429 }) };
    const result = await runParkAndReplay(driver, input, 0, fallback, log, "[test] ");
    assert.ok(result);
    const textPromise = (result as { response: Response }).response.text();
    const text = await Promise.race([
      textPromise,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("failed replay body blocked the public SSE boundary")),
          250
        )
      ),
    ]);
    assert.match(text, /Upstream replay failed \(503\)/u);
    assert.doesNotMatch(text, /shard-alpha|park-secret|internal/u);
    assert.equal(
      upstreamCancelled,
      true,
      "failed upstream body should be cancelled without being published"
    );
  });

  it("client abort cancels a stalled successful replay body copy", async () => {
    const abort = new AbortController();
    let upstreamCancelled = false;
    const stalledBody = new ReadableStream<Uint8Array>({
      pull() {
        return new Promise<void>(() => {});
      },
      cancel() {
        upstreamCancelled = true;
      },
    });
    const account = {
      fingerprint: "y".repeat(32),
      cooldownUntil: 0,
      consecutiveFails: 0,
      proxy: null,
    };
    const driver = {
      accounts: [account],
      execute: async () => ({
        response: new Response(stalledBody, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      }),
      markCooldown() {},
      markSuccess() {},
      sleep: async () => true,
    };
    const input = {
      model: "muse-spark-1.3-contributor-free",
      body: { messages: [{ role: "user", content: "hi" }] },
      stream: true,
      signal: abort.signal,
      credentials: credentialsFor(1),
      log,
    };
    const fallback = { response: new Response(BURST_BODY, { status: 429 }) };
    const result = await runParkAndReplay(driver, input, 0, fallback, log, "[test] ");
    assert.ok(result);
    const textPromise = (result as { response: Response }).response.text();
    setTimeout(() => abort.abort(new DOMException("client gone", "AbortError")), 20);
    await Promise.race([
      textPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("aborted replay body remained blocked")), 250)
      ),
    ]);
    assert.equal(upstreamCancelled, true, "client abort should cancel the replay body reader");
  });

  it("a fresh pool-strain marker parks directly without recounting", async () => {
    writeMarker({ since: Date.now() - 10_000, reason: "i2-zero", ttl_s: 300 });
    installFetch([{ status: 429, body: BURST_BODY }, { status: 200 }]);
    const result = await run(4, true);
    const text = await (result as { response: Response }).response.text();
    assert.ok(text.includes(":ping"), "fresh marker justifies the park");
    assert.ok(observed.length <= 1 + 3, `single replay leg (saw ${observed.length})`);
  });

  it("a stale marker is ignored and only the counter decides", async () => {
    const markerPath = process.env[MARKER_ENV] as string;
    writeMarker({ since: Date.now() - 400_000, reason: "i2-zero", ttl_s: 300 });
    const aged = Date.now() - 400_000;
    fs.utimesSync(markerPath, new Date(aged), new Date(aged));
    installFetch(
      Array.from({ length: BURST_PARK_THRESHOLD - 1 }, () => ({ status: 429, body: BURST_BODY }))
    );
    const result = await run(BURST_PARK_THRESHOLD - 1, true);
    const text = await (result as { response: Response }).response.text();
    assert.ok(!text.includes(":ping"), "stale marker never parks");
    assert.strictEqual(observed.length, BURST_PARK_THRESHOLD - 1);
  });

  it("a future marker stays bounded instead of parking past the ceiling", async () => {
    writeMarker({ since: Date.now() + 60_000, reason: "i2-zero", ttl_s: 300 });
    installFetch([{ status: 429, body: BURST_BODY }, { status: 200 }]);
    const result = await run(4, true);
    const text = await (result as { response: Response }).response.text();
    assert.ok(text.includes(":ping"), "future marker still justifies the park");
  });

  it("flag off keeps the exact current rotation", async () => {
    delete process.env[FLAG];
    installFetch(
      Array.from({ length: BURST_PARK_THRESHOLD }, () => ({ status: 429, body: BURST_BODY }))
    );
    const result = await run(BURST_PARK_THRESHOLD, true);
    const response = (result as { response: Response }).response;
    assert.strictEqual(response.status, 429);
    const text = await response.text();
    assert.ok(!text.includes(":ping"), "no park when the flag is off");
    assert.strictEqual(observed.length, BURST_PARK_THRESHOLD);
  });

  it("a fleet-suspect slot budget hands over to park-and-replay", async () => {
    process.env.OPENCODE_EGRESS_THROTTLE_ENABLED = "1";
    process.env.OPENCODE_EGRESS_THROTTLE_FLEET_THRESHOLD = "1";
    process.env.OPENCODE_EGRESS_THROTTLE_SUSPECT_SLOTS = "1";
    throttle.configureFleetFromConfig(throttle.resolveEgressThrottleConfig(process.env));
    throttle.noteEgress429(Date.now());
    installFetch([{ status: 429, body: BURST_BODY }, { status: 200 }]);
    const result = await run(4, true);
    const response = (result as { response: Response }).response;
    assert.strictEqual(response.status, 200);
    const text = await response.text();
    assert.ok(text.includes(":ping"), "throttle park runs the heartbeat + replay");
  });

  it("a client abort mid-park stops without any further route call", async () => {
    installFetch([
      ...Array.from({ length: BURST_PARK_THRESHOLD }, () => ({ status: 429, body: BURST_BODY })),
      { status: 200 },
    ]);
    const controller = new AbortController();
    const exec = new OpencodeExecutor("opencode-zen");
    exec.parkSleep = async () => {
      controller.abort();
      return false;
    };
    const callsBefore = observed.length;
    const result = await exec.execute({
      model: "muse-spark-1.3-contributor-free",
      body: { messages: [{ role: "user", content: "hi" }], stream: false },
      stream: true,
      signal: controller.signal,
      credentials: credentialsFor(BURST_PARK_THRESHOLD + 1),
      log,
    });
    void result;
    assert.strictEqual(observed.length, BURST_PARK_THRESHOLD, "no route call after abort");
    void callsBefore;
  });
});
