import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const eventBus = await import("../../src/lib/events/eventBus.ts");
const { createRRDashboardEvents } =
  await import("../../open-sse/services/combo/rrDashboardEvents.ts");

test("#13089: RR dashboard helper publishes attempt/success/failure payloads", () => {
  const seen: Array<{ event: string; payload: unknown }> = [];
  const off = [
    eventBus.on("combo.target.attempt", (payload) => seen.push({ event: "attempt", payload })),
    eventBus.on("combo.target.succeeded", (payload) => seen.push({ event: "succeeded", payload })),
    eventBus.on("combo.target.failed", (payload) => seen.push({ event: "failed", payload })),
  ];
  try {
    const rr = createRRDashboardEvents("rr-test", 2, "openai", "gpt-test");
    rr.attempt();
    rr.succeeded(123);
    rr.failed("request failed token=secret-value at /srv/private/config.json", 456);
    assert.equal(seen.length, 3);
    assert.equal((seen[0].payload as { strategy?: string }).strategy, "round-robin");
    assert.equal((seen[1].payload as { latencyMs?: number }).latencyMs, 123);
    const failedError = (seen[2].payload as { error?: string }).error ?? "";
    assert.doesNotMatch(failedError, /secret-value/);
    assert.doesNotMatch(failedError, /\/srv\/private/);
  } finally {
    off.forEach((fn) => fn());
  }
});

test("#13089: roundRobinCombo wires RR events into attempt/success/failure branches", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const source = fs.readFileSync(
    path.join(root, "open-sse/services/combo/roundRobinCombo.ts"),
    "utf8"
  );
  assert.match(source, /createRRDashboardEvents\(combo\.name, modelIndex, provider, modelStr\)/);
  assert.match(source, /rrEvents\.attempt\(\)/);
  assert.match(source, /rrEvents\.succeeded\(latencyMs\)/);
  assert.ok((source.match(/rrEvents\.failed\(/g) || []).length >= 3);
});
