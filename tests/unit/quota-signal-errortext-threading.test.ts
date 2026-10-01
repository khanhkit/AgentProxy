import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { shouldMarkAccountExhaustedFrom429 } =
  await import("../../open-sse/services/accountFallback.ts");

const QUOTA_EXHAUSTED_BODY = JSON.stringify({
  error: "You have exceeded your weekly usage quota. Your quota will reset in 3 days.",
});

test("#13008: apikey 429 with explicit long-window quota body marks account exhausted", () => {
  assert.equal(
    shouldMarkAccountExhaustedFrom429(
      "openai",
      "gpt-4o-mini",
      undefined,
      undefined,
      QUOTA_EXHAUSTED_BODY
    ),
    true
  );
});

test("#13008: plain apikey rate-limit body does not poison quota cache", () => {
  assert.equal(
    shouldMarkAccountExhaustedFrom429(
      "openai",
      "gpt-4o-mini",
      undefined,
      undefined,
      "Rate limit exceeded, retry in 20s"
    ),
    false
  );
});

test("#13008: transient failureKind still wins over an explicit quota body", () => {
  assert.equal(
    shouldMarkAccountExhaustedFrom429(
      "openai",
      "gpt-4o-mini",
      undefined,
      "transient",
      QUOTA_EXHAUSTED_BODY
    ),
    false
  );
});

test("#13008: chat call site forwards errorStr into shouldMarkAccountExhaustedFrom429", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const source = fs.readFileSync(path.join(root, "src/sse/handlers/chat.ts"), "utf8");
  assert.match(
    source,
    /shouldMarkAccountExhaustedFrom429\(\s*provider,\s*model,\s*passthroughModels,\s*failureKind,\s*errorStr\s*\)/m
  );
  assert.match(source, /const errorStr = String\(result\.rawMessage \?\? result\.error \?\? ""\);/);
});
