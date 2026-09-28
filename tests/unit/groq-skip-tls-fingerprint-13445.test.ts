import test from "node:test";
import assert from "node:assert/strict";
import {
  isTlsFingerprintActive,
  setTlsClientForTest,
} from "../../open-sse/utils/proxyFetch.ts";

test("Groq bypasses TLS fingerprint transport even when globally enabled", () => {
  const previousEnabled = process.env.ENABLE_TLS_FINGERPRINT;
  const previousProviders = process.env.TLS_FINGERPRINT_PROVIDERS;

  process.env.ENABLE_TLS_FINGERPRINT = "true";
  delete process.env.TLS_FINGERPRINT_PROVIDERS;
  setTlsClientForTest({
    available: true,
    fetch: async () => Response.json({ via: "tls" }),
  });

  try {
    assert.equal(isTlsFingerprintActive("groq"), false);
    assert.equal(isTlsFingerprintActive("openai"), true);
  } finally {
    setTlsClientForTest(null);
    if (previousEnabled === undefined) delete process.env.ENABLE_TLS_FINGERPRINT;
    else process.env.ENABLE_TLS_FINGERPRINT = previousEnabled;
    if (previousProviders === undefined) delete process.env.TLS_FINGERPRINT_PROVIDERS;
    else process.env.TLS_FINGERPRINT_PROVIDERS = previousProviders;
  }
});
