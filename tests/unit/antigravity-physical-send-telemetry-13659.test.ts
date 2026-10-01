import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const executor = fs.readFileSync(
  path.join(process.cwd(), "open-sse/executors/antigravity.ts"),
  "utf8"
);
const attempt = fs.readFileSync(
  path.join(process.cwd(), "open-sse/executors/antigravity/executeAttempt.ts"),
  "utf8"
);

test("Antigravity threads one physical-send counter and correlation id across fallback attempts", () => {
  assert.match(executor, /type AntigravityPhysicalSendCounter = \{ value: number \}/);
  assert.match(executor, /const physicalSendCounter: AntigravityPhysicalSendCounter = \{ value: 0 \}/);
  assert.match(executor, /this\.executeOnce\(input, candidate, physicalSendCounter\)/);
  assert.match(executor, /correlationId = null/);
  assert.match(executor, /physicalSendCounter,\s*correlationId/);
});

test("every direct Antigravity network send emits physical-send telemetry", () => {
  assert.match(attempt, /const physicalSendOrdinal = \+\+physicalSendCounter\.value/);
  assert.match(attempt, /PhysicalSend: \$\{physicalSendOrdinal\}/);
  assert.match(attempt, /RequestId: \$\{correlationId \?\? "none"\}/);
  assert.match(attempt, /const retryPhysicalSendOrdinal = \+\+physicalSendCounter\.value/);
  assert.match(attempt, /Cause: x-goog-user-project-403/);
});

test("credits retry participates in the same physical-send counter", () => {
  assert.match(attempt, /const creditsPhysicalSendOrdinal = \+\+physicalSendCounter\.value/);
  assert.match(attempt, /Cause: google-one-ai-credits-retry/);
});
