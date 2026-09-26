import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "agentproxy-auto-best-no-warn-"));
const logFile = join(dir, "app.log");
process.env.NODE_ENV = "production";
process.env.APP_LOG_TO_FILE = "true";
process.env.APP_LOG_FILE_PATH = logFile;
process.env.APP_LOG_LEVEL = "debug";
process.env.DATA_DIR = join(dir, "data");

const { resolveAutoRoutingState } = await import("../../src/sse/handlers/autoRouting.ts");

after(() => {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

async function readLogWhen(
  predicate: (contents: string) => boolean,
  timeoutMs = 4000
): Promise<string> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (existsSync(logFile)) {
      const contents = readFileSync(logFile, "utf8");
      if (predicate(contents)) return contents;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return existsSync(logFile) ? readFileSync(logFile, "utf8") : "";
}

test("AP-ISS-0124 built-in auto/best-* variant does not log invalid-prefix warning", async () => {
  const state = await resolveAutoRoutingState("auto/best-coding");
  assert.equal(state.recognizedBuiltInAuto, true);
  assert.equal(state.variant, "coding");
  assert.equal(state.response, null);

  await readLogWhen((contents) => contents.includes("Zero-config routing variant"));
  const contents = existsSync(logFile) ? readFileSync(logFile, "utf8") : "";
  assert.doesNotMatch(contents, /Invalid auto prefix format: auto\/best-coding/);
});

test("AP-ISS-0124 unknown auto variant still emits invalid-prefix warning", async () => {
  const state = await resolveAutoRoutingState("auto/not-a-real-variant");
  assert.equal(state.recognizedBuiltInAuto, false);

  const contents = await readLogWhen((text) =>
    text.includes("Invalid auto prefix format: auto/not-a-real-variant")
  );
  assert.match(contents, /Invalid auto prefix format: auto\/not-a-real-variant/);
});
