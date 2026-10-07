import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateDevinCloudAgentProvider } from "../../src/lib/providers/validation/webProvidersB.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fakeBin = path.join(__dirname, "fake-devin-cli-validator.mjs");

async function withHttpStatus<T>(status: number, fn: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch;
  const originalBin = process.env.CLI_DEVIN_BIN;
  globalThis.fetch = (async () => new Response("{}", { status })) as typeof fetch;
  process.env.CLI_DEVIN_BIN = fakeBin;
  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalBin === undefined) delete process.env.CLI_DEVIN_BIN;
    else process.env.CLI_DEVIN_BIN = originalBin;
  }
}

test("CLI-format Devin key survives HTTP 401 when the real CLI probe accepts it", async () => {
  const result = await withHttpStatus(401, () =>
    validateDevinCloudAgentProvider({ apiKey: "apk_user_valid_cli_key" })
  );
  assert.equal(result.valid, true);
  assert.equal(result.error, null);
  assert.match(result.warning ?? "", /validated via Devin CLI/i);
});

test("HTTP auth rejection stays invalid when CLI probe rejects the key", async () => {
  const result = await withHttpStatus(403, () =>
    validateDevinCloudAgentProvider({ apiKey: "bad-key" })
  );
  assert.equal(result.valid, false);
  assert.equal(result.error, "Invalid API key");
});

test("HTTP 2xx remains authoritative and does not require the fallback", async () => {
  const result = await withHttpStatus(200, () =>
    validateDevinCloudAgentProvider({ apiKey: "cog_good_key" })
  );
  assert.equal(result.valid, true);
  assert.equal(result.error, null);
});
