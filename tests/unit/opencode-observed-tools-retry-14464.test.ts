import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { OpencodeExecutor } from "../../open-sse/executors/opencode.ts";
import type { ExecutorLog, ProviderCredentials } from "../../open-sse/executors/base.ts";
import { isOpencodeFreeTierRefusal } from "../../open-sse/executors/opencodeGeoBlock.ts";
import {
  _resetToolObservationForTests,
  getObservedToolNames,
  recordAcceptedToolNames,
} from "../../open-sse/executors/opencodeToolObservation.ts";
import { resolveProxyForRequest } from "../../open-sse/utils/proxyFetch.ts";

const MODEL = "hy3-free";
const REFUSAL_BODY = JSON.stringify({
  type: "error",
  error: {
    type: "FreeTierError",
    message:
      "Error from provider (Console): OpenCode's free tier can only be used from within OpenCode",
  },
});
const log: ExecutorLog = { debug() {}, info() {}, warn() {}, error() {} };

function chatTool(name: string, marker = name) {
  return {
    type: "function",
    function: {
      name,
      description: `tool-${marker}`,
      parameters: {
        type: "object",
        properties: { [marker]: { type: "string" } },
        required: [marker],
      },
    },
  };
}

function toolName(tool: unknown): string | null {
  if (!tool || typeof tool !== "object" || Array.isArray(tool)) return null;
  const record = tool as Record<string, unknown>;
  if (typeof record.name === "string") return record.name;
  const fn = record.function;
  if (!fn || typeof fn !== "object" || Array.isArray(fn)) return null;
  const name = (fn as Record<string, unknown>).name;
  return typeof name === "string" ? name : null;
}

function directCredentials(): ProviderCredentials {
  return {
    apiKey: null,
    accessToken: null,
    connectionId: "noauth",
    providerSpecificData: { fingerprints: [] },
  };
}

function body(tools: unknown[]) {
  return {
    model: MODEL,
    messages: [{ role: "user", content: "same conversation" }],
    stream: false,
    tools,
  };
}

async function execute(
  exec: OpencodeExecutor,
  tools: unknown[],
  credentials: ProviderCredentials = directCredentials()
) {
  return (await exec.execute({
    model: MODEL,
    body: body(tools),
    stream: false,
    signal: null,
    credentials,
    log,
  })) as { response: Response };
}

describe("#14464 OpenCode observed accepted-tool completion", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    _resetToolObservationForTests();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    _resetToolObservationForTests();
  });

  it("recognizes only the request-scoped FreeTierError motif", () => {
    assert.equal(isOpencodeFreeTierRefusal(403, REFUSAL_BODY), true);
    assert.equal(isOpencodeFreeTierRefusal(451, REFUSAL_BODY), true);
    assert.equal(
      isOpencodeFreeTierRefusal(
        403,
        JSON.stringify({ error: { type: "RegionError", message: "not available in your country" } })
      ),
      false
    );
    assert.equal(
      isOpencodeFreeTierRefusal(403, JSON.stringify({ error: { type: "user_blocked" } })),
      false
    );
    assert.equal(isOpencodeFreeTierRefusal(400, REFUSAL_BODY), false);
  });

  it("retries once with missing accepted names after caller tools and returns retry success", async () => {
    const exec = new OpencodeExecutor("opencode-zen");
    const seenTools: unknown[][] = [];
    let call = 0;

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const parsed = JSON.parse(String(init?.body ?? "{}")) as { tools?: unknown[] };
      seenTools.push(parsed.tools ?? []);
      call++;
      if (call === 1) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (call === 2) {
        return new Response(REFUSAL_BODY, {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof globalThis.fetch;

    const full = [chatTool("glob", "g"), chatTool("read", "r"), chatTool("edit", "e")];
    await (await execute(exec, full)).response.body?.cancel();

    const subset = [chatTool("glob", "g"), chatTool("read", "r")];
    const result = await execute(exec, subset);

    assert.equal(result.response.status, 200);
    assert.equal(call, 3, "warm success + refusal + exactly one retry");
    assert.deepEqual(
      seenTools[1].map(toolName),
      ["glob", "read", "edit"],
      "the observed compatibility name is appended proactively"
    );
    assert.deepEqual(seenTools[2].map(toolName), ["glob", "read", "edit"]);
    assert.deepEqual(seenTools[2][0], subset[0], "caller tool schema/order preserved");
    assert.deepEqual(seenTools[2][1], subset[1], "caller tool schema/order preserved");
    assert.deepEqual(
      (seenTools[2][2] as { function: { parameters: unknown } }).function.parameters,
      { type: "object", properties: {} },
      "appended observed name is a non-callable compatibility placeholder"
    );
    await result.response.body?.cancel();
  });

  it("returns the original refusal when the one retry fails and keeps observation state", async () => {
    const exec = new OpencodeExecutor("opencode-zen");
    let call = 0;
    globalThis.fetch = (async () => {
      call++;
      if (call === 1) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(REFUSAL_BODY, {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof globalThis.fetch;

    await (
      await execute(exec, [chatTool("glob"), chatTool("read"), chatTool("edit")])
    ).response.body?.cancel();

    const result = await execute(exec, [chatTool("glob"), chatTool("read")]);
    assert.equal(result.response.status, 403);
    assert.equal(await result.response.text(), REFUSAL_BODY);
    assert.equal(call, 3, "warm success + refusal + exactly one failed retry");
    assert.deepEqual(getObservedToolNames("opencode-zen", MODEL), ["glob", "read", "edit"]);
  });

  it("returns the original refusal when the retry transport throws", async () => {
    const exec = new OpencodeExecutor("opencode-zen");
    let call = 0;
    globalThis.fetch = (async () => {
      call++;
      if (call === 1) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (call === 2) {
        return new Response(REFUSAL_BODY, {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new TypeError("synthetic retry transport failure");
    }) as typeof globalThis.fetch;

    await (
      await execute(exec, [chatTool("glob"), chatTool("read"), chatTool("edit")])
    ).response.body?.cancel();

    const result = await execute(exec, [chatTool("glob"), chatTool("read")]);
    assert.equal(result.response.status, 403);
    assert.equal(await result.response.text(), REFUSAL_BODY);
    assert.equal(call, 3, "warm success + refusal + exactly one throwing retry");
    assert.deepEqual(getObservedToolNames("opencode-zen", MODEL), ["glob", "read", "edit"]);
  });

  it("does not retry when accepted observation contains no missing name", async () => {
    const exec = new OpencodeExecutor("opencode-zen");
    let call = 0;
    globalThis.fetch = (async () => {
      call++;
      if (call === 1) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(REFUSAL_BODY, {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof globalThis.fetch;

    const tools = [chatTool("glob"), chatTool("read")];
    await (await execute(exec, tools)).response.body?.cancel();
    const result = await execute(exec, tools);

    assert.equal(result.response.status, 403);
    assert.equal(call, 2, "no extra dispatch when nothing is missing");
    await result.response.body?.cancel();
  });

  it("does not apply observed-tools retry to a premium model", async () => {
    const model = "gpt-5.4";
    assert.equal(OpencodeExecutor.isPremiumModel(model, "opencode-zen"), true);
    recordAcceptedToolNames("opencode-zen", model, undefined, ["glob", "read", "edit"]);

    const exec = new OpencodeExecutor("opencode-zen");
    let call = 0;
    globalThis.fetch = (async () => {
      call++;
      return new Response(REFUSAL_BODY, {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof globalThis.fetch;

    const result = (await exec.execute({
      model,
      body: body([chatTool("glob"), chatTool("read")]),
      stream: false,
      signal: null,
      credentials: {
        apiKey: "premium-test-key",
        accessToken: null,
        connectionId: "premium",
        providerSpecificData: { fingerprints: [] },
      },
      log,
    })) as { response: Response };

    assert.equal(result.response.status, 403);
    assert.equal(call, 1, "premium request must not enter the free-tier retry path");
    await result.response.body?.cancel();
  });

  it("appends flat compatibility tools on an OpenAI Responses target", async () => {
    const exec = new OpencodeExecutor("opencode-zen");
    const model = "muse-spark-1.2-contributor-free";
    const seenTools: unknown[][] = [];
    let call = 0;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const parsed = JSON.parse(String(init?.body ?? "{}")) as { tools?: unknown[] };
      seenTools.push(parsed.tools ?? []);
      call++;
      return new Response(call === 2 ? REFUSAL_BODY : JSON.stringify({ ok: true }), {
        status: call === 2 ? 403 : 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof globalThis.fetch;

    const run = async (tools: unknown[]) =>
      (await exec.execute({
        model,
        body: {
          model,
          input: [{ role: "user", content: "same responses conversation" }],
          tools,
          stream: false,
        },
        stream: false,
        signal: null,
        credentials: directCredentials(),
        log,
      })) as { response: Response };

    const flat = (name: string) => ({
      type: "function",
      name,
      description: `tool-${name}`,
      parameters: { type: "object", properties: { [name]: { type: "string" } } },
    });
    await (await run([flat("glob"), flat("read"), flat("edit")])).response.body?.cancel();
    const result = await run([flat("glob"), flat("read")]);

    assert.equal(result.response.status, 200);
    assert.equal(call, 3);
    assert.deepEqual(seenTools[2].map(toolName), ["glob", "read", "edit"]);
    assert.deepEqual((seenTools[2][2] as { parameters: unknown }).parameters, {
      type: "object",
      properties: {},
    });
    await result.response.body?.cancel();
  });
});

describe("#14464 multi-account egress and health invariants", () => {
  let originalFetch: typeof globalThis.fetch;
  const servers: net.Server[] = [];
  const ports: number[] = [];
  const fingerprints = ["a".repeat(32), "b".repeat(32)];

  before(async () => {
    for (let i = 0; i < fingerprints.length; i++) {
      const server = net.createServer((socket) => socket.destroy());
      servers.push(server);
      ports.push(
        await new Promise<number>((resolve) => {
          server.listen(0, "127.0.0.1", () => resolve((server.address() as net.AddressInfo).port));
        })
      );
    }
  });

  after(() => {
    for (const server of servers) server.close();
  });

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    _resetToolObservationForTests();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    _resetToolObservationForTests();
  });

  function credentials(): ProviderCredentials {
    return {
      apiKey: null,
      accessToken: null,
      connectionId: "noauth",
      providerSpecificData: {
        fingerprints,
        accountProxies: fingerprints.map((fingerprint, index) => ({
          fingerprint,
          proxy: { type: "http", host: "127.0.0.1", port: ports[index] },
        })),
      },
    };
  }

  it("returns an unrepairable FreeTierError without rotating or marking success", async () => {
    const exec = new OpencodeExecutor("opencode-zen");
    const creds = credentials();
    const observedEgress: string[] = [];
    let call = 0;

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const resolved = resolveProxyForRequest(url);
      observedEgress.push(resolved.proxyUrl ? new URL(resolved.proxyUrl).port : "direct");
      call++;
      return new Response(REFUSAL_BODY, {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof globalThis.fetch;

    // Materialize the account list without recording an accepted tool observation.
    await (await execute(exec, [], creds)).response.body?.cancel();
    const accounts = (
      exec as unknown as {
        accounts: Array<{ cooldownUntil: number; consecutiveFails: number }>;
      }
    ).accounts;
    for (const account of accounts) {
      account.cooldownUntil = 0;
      account.consecutiveFails = 2;
    }
    call = 0;
    observedEgress.length = 0;

    const result = await execute(exec, [chatTool("glob")], creds);
    assert.equal(result.response.status, 403);
    assert.equal(call, 1, "request-scoped refusal is returned without sibling rotation");
    assert.equal(observedEgress.length, 1);
    for (const account of accounts) {
      assert.equal(account.cooldownUntil, 0);
      assert.equal(account.consecutiveFails, 2, "refusal is not an account success");
    }
    await result.response.body?.cancel();
  });

  it("retries on the same proxy and does not mutate account health", async () => {
    const exec = new OpencodeExecutor("opencode-zen");
    const creds = credentials();
    const observedEgress: string[] = [];
    let call = 0;

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const resolved = resolveProxyForRequest(url);
      observedEgress.push(resolved.proxyUrl ? new URL(resolved.proxyUrl).port : "direct");
      call++;
      if (call === 1) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (call === 2) {
        return new Response(REFUSAL_BODY, {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof globalThis.fetch;

    await (
      await execute(exec, [chatTool("glob"), chatTool("read"), chatTool("edit")], creds)
    ).response.body?.cancel();

    const accounts = (
      exec as unknown as {
        accounts: Array<{ cooldownUntil: number; consecutiveFails: number }>;
      }
    ).accounts;
    for (const account of accounts) {
      account.cooldownUntil = 0;
      account.consecutiveFails = 2;
    }

    const result = await execute(exec, [chatTool("glob"), chatTool("read")], creds);
    assert.equal(result.response.status, 200);
    assert.equal(observedEgress.length, 3);
    assert.equal(
      observedEgress[1],
      observedEgress[2],
      "refusal retry stays on the exact selected proxy"
    );
    for (const account of accounts) {
      assert.equal(account.cooldownUntil, 0, "request-scoped refusal never cools an account");
      assert.equal(
        account.consecutiveFails,
        2,
        "request-scoped refusal/retry does not mark any account success"
      );
    }
    await result.response.body?.cancel();
  });
});
