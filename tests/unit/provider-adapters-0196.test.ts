import test from "node:test";
import assert from "node:assert/strict";

import { ProviderRouter, parseProviderConfig } from "../../open-sse/services/providerAdapters.ts";
import { setSafeOutboundPinnedFetchTestOverride } from "../../src/shared/network/safeOutboundFetch.ts";

test("AP-ISS-0196: credential-bearing provider adapters block metadata before fetch", async () => {
  for (const kind of ["openai", "anthropic", "local"] as const) {
    const config = parseProviderConfig(`providers:
  - id: ${kind}
    kind: ${kind}
    baseUrl: http://169.254.169.254/latest
    model: test-model
    apiKey: secret-${kind}
`);
    const router = new ProviderRouter(config);
    let calls = 0;
    setSafeOutboundPinnedFetchTestOverride(() => async () => {
      calls++;
      return new Response("unexpected");
    });
    try {
      await assert.rejects(
        router.complete({ messages: [{ role: "user", content: "hi" }] }, kind),
        /blocked|outbound|metadata|guard/i,
        kind
      );
    } finally {
      setSafeOutboundPinnedFetchTestOverride(undefined);
    }
    assert.equal(calls, 0, `${kind}: blocked destination must not receive configured credentials`);
  }
});

test("AP-ISS-0196 review: credentialed default provider transport uses the DNS-pinned fetch", async () => {
  const config = parseProviderConfig(`providers:
  - id: pinned
    kind: openai
    baseUrl: http://127.0.0.1:8899
    model: test-model
    apiKey: pinned-secret
`);
  const router = new ProviderRouter(config);
  const pinnedTo: string[] = [];
  setSafeOutboundPinnedFetchTestOverride((address) => {
    pinnedTo.push(address);
    return async () => Response.json({ ok: true });
  });
  try {
    const response = await router.complete(
      { messages: [{ role: "user", content: "hi" }] },
      "pinned"
    );
    assert.equal(response.status, 200);
    assert.deepEqual(pinnedTo, ["127.0.0.1"]);
  } finally {
    setSafeOutboundPinnedFetchTestOverride(undefined);
  }
});

test("AP-ISS-0196 review: credentialed provider rejects a custom transport that cannot preserve DNS pinning", async () => {
  const config = parseProviderConfig(`providers:
  - id: pinned-custom
    kind: openai
    baseUrl: http://127.0.0.1:8899
    model: test-model
    apiKey: pinned-secret
`);
  const router = new ProviderRouter(config);
  let calls = 0;
  await assert.rejects(
    router.complete({ messages: [{ role: "user", content: "hi" }] }, "pinned-custom", async () => {
      calls++;
      return Response.json({ ok: true });
    }),
    /credentialed.*custom transport|custom transport.*DNS pin/i
  );
  assert.equal(calls, 0);
});

test("AP-ISS-0196 review: unauthenticated provider also rejects an unpinned custom transport", async () => {
  const config = parseProviderConfig(`providers:
  - id: unpinned-custom
    kind: openai
    baseUrl: http://127.0.0.1:8899
    model: test-model
`);
  const router = new ProviderRouter(config);
  let calls = 0;
  await assert.rejects(
    router.complete(
      { messages: [{ role: "user", content: "hi" }] },
      "unpinned-custom",
      async () => {
        calls++;
        return Response.json({ ok: true });
      }
    ),
    /custom transport.*DNS pin|DNS pin.*custom transport/i
  );
  assert.equal(calls, 0);
});

test("AP-ISS-0196: Anthropic adapter translates OpenAI system messages before dispatch", async () => {
  const config = parseProviderConfig(`providers:
  - id: anthropic
    kind: anthropic
    baseUrl: http://127.0.0.1:8899
    model: claude-sonnet-4-5
`);
  const router = new ProviderRouter(config);
  let captured: Record<string, unknown> | null = null;
  setSafeOutboundPinnedFetchTestOverride(() => async (_url, init) => {
    captured = JSON.parse(String(init?.body ?? "{}"));
    return new Response('{"content":[]}', { status: 200 });
  });
  try {
    await router.complete(
      {
        messages: [
          { role: "system", content: "keep this policy" },
          { role: "user", content: "hello" },
        ],
        max_tokens: 64,
      },
      "anthropic"
    );
  } finally {
    setSafeOutboundPinnedFetchTestOverride(undefined);
  }
  assert.ok(captured);
  const messages = captured.messages as Array<{ role?: string }>;
  assert.ok(Array.isArray(messages));
  assert.equal(
    messages.some((message) => message.role === "system"),
    false
  );
  assert.match(JSON.stringify(captured.system), /keep this policy/);
});

test("AP-ISS-0196: duplicate provider ids are rejected during config parsing", () => {
  assert.throws(
    () =>
      parseProviderConfig(`providers:
  - id: duplicate
    kind: openai
    baseUrl: http://127.0.0.1:9001
    model: first
  - id: duplicate
    kind: local
    baseUrl: http://127.0.0.1:9002
    model: second
`),
    /duplicate.*provider|provider.*duplicate/i
  );
});

test("AP-ISS-0196 review: Anthropic adapter normalizes non-stream success to OpenAI", async () => {
  const config = parseProviderConfig(`providers:
  - id: anthropic-response
    kind: anthropic
    baseUrl: http://127.0.0.1:8899
    model: claude-sonnet-4-5
`);
  const router = new ProviderRouter(config);
  setSafeOutboundPinnedFetchTestOverride(
    () => async () =>
      Response.json({
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-4-5",
        content: [{ type: "text", text: "hello back" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 3, output_tokens: 2 },
      })
  );
  let response: Response;
  try {
    response = await router.complete(
      { messages: [{ role: "user", content: "hello" }], stream: false },
      "anthropic-response"
    );
  } finally {
    setSafeOutboundPinnedFetchTestOverride(undefined);
  }
  const body = await response.json();
  assert.equal(body.object, "chat.completion");
  assert.equal(body.choices?.[0]?.message?.content, "hello back");
  assert.deepEqual(body.usage, { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 });
});

test("AP-ISS-0196 review: Anthropic adapter normalizes streaming success to OpenAI SSE", async () => {
  const config = parseProviderConfig(`providers:
  - id: anthropic-stream
    kind: anthropic
    baseUrl: http://127.0.0.1:8899
    model: claude-sonnet-4-5
`);
  const router = new ProviderRouter(config);
  const anthropicSse = [
    'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","model":"claude-sonnet-4-5","usage":{"input_tokens":1,"output_tokens":0}}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hello"}}\n\n',
    'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}\n\n',
    'event: message_stop\ndata: {"type":"message_stop"}\n\n',
  ].join("");
  setSafeOutboundPinnedFetchTestOverride(
    () => async () =>
      new Response(anthropicSse, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "content-encoding": "gzip",
          "content-length": String(anthropicSse.length),
        },
      })
  );
  let response: Response;
  try {
    response = await router.complete(
      { messages: [{ role: "user", content: "hello" }], stream: true },
      "anthropic-stream"
    );
  } finally {
    setSafeOutboundPinnedFetchTestOverride(undefined);
  }
  assert.equal(
    response.headers.get("content-encoding"),
    null,
    "a transformed decoded body must not retain upstream content-encoding"
  );
  assert.equal(response.headers.get("content-length"), null);
  const body = await response.text();
  assert.match(body, /chat\.completion\.chunk/);
  assert.match(body, /hello/);
  assert.doesNotMatch(body, /text_delta/);
});
