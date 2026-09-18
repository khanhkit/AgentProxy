import assert from "node:assert/strict";
import test from "node:test";
import type { IncomingHttpHeaders } from "node:http";

import { MitmHandlerBase } from "../../../src/mitm/handlers/base.ts";
import type { AgentId } from "../../../src/mitm/types.ts";

class TestHandler extends MitmHandlerBase {
  readonly agentId: AgentId = "antigravity";

  async intercept(): Promise<void> {
    // Not exercised by this focused contract suite.
  }

  publicFetchRouter(body: unknown, path: string, headers: IncomingHttpHeaders): Promise<Response> {
    return this.fetchRouter(body, path, headers);
  }
}

interface CapturedFetch {
  url: string;
  init: RequestInit;
}

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ROUTER_API_KEY = process.env.ROUTER_API_KEY;
const ORIGINAL_BASE_URL = process.env.OMNIROUTE_BASE_URL;

async function captureRouterFetch(
  clientHeaders: IncomingHttpHeaders,
  body: unknown = { model: "test-model", messages: [] },
  path = "/v1/chat/completions"
): Promise<CapturedFetch> {
  process.env.ROUTER_API_KEY = "router-owned-secret";
  process.env.OMNIROUTE_BASE_URL = "http://router.internal:20128/";

  let captured: CapturedFetch | null = null;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    captured = {
      url: String(input),
      init: init ?? {},
    };
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const handler = new TestHandler();
    await handler.publicFetchRouter(body, path, clientHeaders);
  } finally {
    globalThis.fetch = ORIGINAL_FETCH;
    if (ORIGINAL_ROUTER_API_KEY === undefined) delete process.env.ROUTER_API_KEY;
    else process.env.ROUTER_API_KEY = ORIGINAL_ROUTER_API_KEY;
    if (ORIGINAL_BASE_URL === undefined) delete process.env.OMNIROUTE_BASE_URL;
    else process.env.OMNIROUTE_BASE_URL = ORIGINAL_BASE_URL;
  }

  assert.ok(captured, "fetchRouter must invoke fetch");
  return captured;
}

function normalizedHeaders(init: RequestInit): Headers {
  return new Headers(init.headers);
}

test("TC-MITM-ROUTER-SEC-001 client Authorization cannot replace the configured router credential", async () => {
  for (const [label, headers] of [
    ["lowercase", { authorization: "Bearer client-owned-secret-lower" }],
    ["canonical-case", { Authorization: "Bearer client-owned-secret-upper" }],
  ] as const) {
    const captured = await captureRouterFetch(headers);
    const effective = normalizedHeaders(captured.init);

    assert.equal(
      effective.get("authorization"),
      "Bearer router-owned-secret",
      `${label} client Authorization must not alter the gateway-owned router credential`
    );
  }
});

test("TC-MITM-ROUTER-SEC-002 raw client auth/cookie/API-key secrets do not cross the router boundary", async () => {
  const sentinels = [
    "client-bearer-raw-secret-abcdefghijklmnopqrstuvwxyz",
    "client-cookie-raw-secret-abcdefghijklmnopqrstuvwxyz",
    "client-x-api-key-raw-secret-abcdefghijklmnopqrstuvwxyz",
    "client-goog-api-key-raw-secret-abcdefghijklmnopqrstuvwxyz",
  ];

  const captured = await captureRouterFetch({
    authorization: `Bearer ${sentinels[0]}`,
    cookie: `session=${sentinels[1]}`,
    "x-api-key": sentinels[2],
    "x-goog-api-key": sentinels[3],
    "x-request-id": "req-kittest-router-boundary",
  });
  const effective = normalizedHeaders(captured.init);
  const allValues = Array.from(effective.values()).join("\n");

  for (const secret of sentinels) {
    assert.equal(
      allValues.includes(secret),
      false,
      `raw client secret must not appear in effective internal-router headers: ${secret.slice(0, 18)}…`
    );
  }

  assert.equal(effective.get("cookie"), "[REDACTED]");
  assert.equal(effective.get("x-request-id"), "req-kittest-router-boundary");
});

test("TC-MITM-ROUTER-REG-003 no-client-auth request preserves router credential and bridge metadata", async () => {
  const body = { model: "test-model", messages: [{ role: "user", content: "hello" }] };
  const captured = await captureRouterFetch(
    {
      "content-type": "application/json",
      "x-request-id": "req-control",
    },
    body,
    "/v1/chat/completions"
  );
  const effective = normalizedHeaders(captured.init);

  assert.equal(captured.url, "http://router.internal:20128/v1/chat/completions");
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.body, JSON.stringify(body));
  assert.equal(effective.get("authorization"), "Bearer router-owned-secret");
  assert.equal(effective.get("x-omniroute-source"), "agent-bridge");
  assert.equal(effective.get("x-omniroute-agent"), "antigravity");
  assert.equal(effective.get("x-request-id"), "req-control");
});
