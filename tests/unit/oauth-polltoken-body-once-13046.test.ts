import test from "node:test";
import assert from "node:assert/strict";

import { github } from "../../src/lib/oauth/providers/github.ts";
import { kimiCoding } from "../../src/lib/oauth/providers/kimi-coding.ts";
import { GITHUB_CONFIG, KIMI_CODING_CONFIG } from "../../src/lib/oauth/constants/oauth.ts";

async function withFetch(body: string, status: number, fn: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(body, { status });
  try {
    await fn();
  } finally {
    globalThis.fetch = original;
  }
}

for (const [name, provider, config] of [
  ["github", github, GITHUB_CONFIG],
  ["kimi-coding", kimiCoding, KIMI_CODING_CONFIG],
] as const) {
  test(`${name} pollToken handles non-JSON body without double-read rejection`, async () => {
    await withFetch("<html>502 Bad Gateway</html>", 502, async () => {
      const result = await provider.pollToken(config, "device-code");
      assert.equal(result.ok, false);
      assert.equal(result.data.error, "invalid_response");
      assert.match(result.data.error_description, /502 Bad Gateway/);
    });
  });

  test(`${name} pollToken still parses JSON body`, async () => {
    await withFetch(JSON.stringify({ error: "authorization_pending" }), 400, async () => {
      const result = await provider.pollToken(config, "device-code");
      assert.equal(result.data.error, "authorization_pending");
    });
  });
}
