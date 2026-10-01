import test from "node:test";
import assert from "node:assert/strict";

const { generateLegacyProviders } = await import("../../open-sse/config/providerRegistry.ts");
const { resolveFetchStartTimeout } = await import("../../open-sse/utils/fetchStartTimeoutPolicy.ts");

test("#13002: buffered providers project a 600s fetch-start cap and 16k max tokens", () => {
  const providers = generateLegacyProviders();
  for (const id of ["opencode-go", "command-code"]) {
    const legacy = providers[id];
    assert.ok(legacy, id);
    assert.equal(legacy.fetchStartTimeoutCapMs, 600_000, id);
    assert.equal(legacy.requestDefaults?.maxTokens, 16_384, id);
  }
});

test("#13002: provider cap overrides the default streaming cap", () => {
  assert.deepEqual(
    resolveFetchStartTimeout({ baseTimeoutMs: 600_000, stream: true, capMs: 600_000 }),
    { timeoutMs: 600_000, baseTimeoutMs: 600_000, capped: false }
  );
  assert.deepEqual(
    resolveFetchStartTimeout({ baseTimeoutMs: 600_000, stream: true }),
    { timeoutMs: 110_000, baseTimeoutMs: 600_000, capped: true }
  );
});

test("#13002: providers without override do not gain a legacy cap", () => {
  const providers = generateLegacyProviders();
  const plain = providers.openai;
  if (plain) assert.equal(plain.fetchStartTimeoutCapMs, undefined);
});
