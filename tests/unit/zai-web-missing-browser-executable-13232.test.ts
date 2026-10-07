import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { isMissingBrowserExecutable } =
  await import("../../open-sse/executors/browserExecutableCheck.ts");
const { makeExecutorErrorResult } = await import("../../open-sse/utils/error.ts");
const { serviceSupervisorCooldown } = await import("../../open-sse/config/errorConfig.ts");

test("#13232: shared classifier recognizes missing Playwright Chromium", () => {
  for (const message of [
    "chromium.launch: Executable doesn't exist at /tmp/chrome",
    "ExecutableNotFound: chromium",
    "Please run playwright install chromium",
    "Chromium browser download required",
  ]) assert.equal(isMissingBrowserExecutable(message), true, message);
  assert.equal(isMissingBrowserExecutable("upstream returned 502"), false);
});

test("#13232: AgentProxy cooldown hint survives executor error response and is consumed", async () => {
  const result = makeExecutorErrorResult(
    503,
    "Z.ai requires the Playwright Chromium browser, which is not installed.",
    {},
    "https://chat.z.ai/",
    { "X-AgentProxy-Fallback-Hint": "connection_cooldown" }
  );
  assert.equal(result.response.headers.get("X-AgentProxy-Fallback-Hint"), "connection_cooldown");
  assert.equal(serviceSupervisorCooldown(503, result.response.headers)?.skipProviderBreaker, true);
});

test("#13232: Z.ai missing-browser branch uses AgentProxy cooldown namespace", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const source = fs.readFileSync(path.join(root, "open-sse/executors/zai-web.ts"), "utf8");
  assert.match(source, /isMissingBrowserExecutable\(rawMessage\)/);
  assert.match(source, /"X-AgentProxy-Fallback-Hint": "connection_cooldown"/);
  assert.doesNotMatch(source, /X-Omni-Fallback-Hint/);
});
