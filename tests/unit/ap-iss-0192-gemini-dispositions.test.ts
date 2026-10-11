import test from "node:test";
import assert from "node:assert/strict";

import { GeminiWebExecutor } from "../../open-sse/executors/gemini-web.ts";

test("AP-ISS-0192 4233291693 rejects unknown model before launching Chromium", async () => {
  const playwright = await import("playwright");
  const originalLaunch = playwright.chromium.launch;
  let launches = 0;
  playwright.chromium.launch = (async () => {
    launches += 1;
    throw new Error("Chromium launch should not be reached for an unknown model");
  }) as typeof originalLaunch;

  try {
    const result = await new GeminiWebExecutor().execute({
      model: "gemini-definitely-unknown",
      body: { messages: [{ role: "user", content: "hello" }] },
      stream: false,
      credentials: { apiKey: "__Secure-1PSID=fake" },
      signal: AbortSignal.timeout(5000),
      log: null,
    });
    assert.equal(result.response.status, 400);
    assert.equal(launches, 0, "deterministic validation must happen before browser startup");
  } finally {
    playwright.chromium.launch = originalLaunch;
  }
});
