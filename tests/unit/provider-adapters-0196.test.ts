import test from "node:test";
import assert from "node:assert/strict";

import { ProviderRouter, parseProviderConfig } from "../../open-sse/services/providerAdapters.ts";

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
    await assert.rejects(
      router.complete({ messages: [{ role: "user", content: "hi" }] }, kind, async () => {
        calls++;
        return new Response("unexpected");
      }),
      /blocked|outbound|metadata|guard/i,
      kind
    );
    assert.equal(calls, 0, `${kind}: blocked destination must not receive configured credentials`);
  }
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
  await router.complete(
    {
      messages: [
        { role: "system", content: "keep this policy" },
        { role: "user", content: "hello" },
      ],
      max_tokens: 64,
    },
    "anthropic",
    async (_url, init) => {
      captured = JSON.parse(String(init?.body ?? "{}"));
      return new Response('{"content":[]}', { status: 200 });
    }
  );
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
