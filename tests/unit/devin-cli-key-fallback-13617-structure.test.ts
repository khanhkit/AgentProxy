import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/lib/providers/validation/webProvidersB.ts"),
  "utf8"
);

test("Devin HTTP auth rejection can fall back to the CLI executor auth path", () => {
  assert.match(source, /import \{ spawn \} from "child_process"/);
  assert.match(source, /async function validateDevinCliKeyFallback/);
  assert.match(source, /CLI_DEVIN_BIN/);
  assert.match(source, /WINDSURF_API_KEY: String\(apiKey \|\| ""\)/);
  assert.match(source, /\["acp", "--agent-type", "summarizer"\]/);
});

test("only 401/403 invokes CLI fallback and exit zero becomes valid", () => {
  assert.match(source, /if \(response\.status === 401 \|\| response\.status === 403\)/);
  assert.match(source, /const cliCheck = await validateDevinCliKeyFallback\(apiKey\)/);
  assert.match(source, /if \(cliCheck\.valid\)/);
  assert.match(source, /validated via Devin CLI/i);
  assert.match(source, /if \(code === 0\) resolve\(\{ valid: true, error: null \}\)/);
});
