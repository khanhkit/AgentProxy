import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_STREAM_ACTIVE_TIMEOUT_MS,
  MAX_REGISTERED_MODEL_TIMEOUT_MARGIN_MS,
} from "../../src/shared/utils/runtimeTimeouts.ts";

const REGISTRY_ROOT = join(process.cwd(), "open-sse/config/providers/registry");
const TIMEOUT_LITERAL = /timeoutMs:\s*([0-9_]+)/g;

function collectTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectTsFiles(full, out);
    else if (full.endsWith(".ts")) out.push(full);
  }
  return out;
}

function maxRegisteredTimeoutMs(): { value: number; file: string } {
  let best = { value: 0, file: "" };
  for (const file of collectTsFiles(REGISTRY_ROOT)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(TIMEOUT_LITERAL)) {
      const value = Number(match[1].replaceAll("_", ""));
      if (Number.isFinite(value) && value > best.value) best = { value, file };
    }
  }
  return best;
}

test("the default active-stream budget covers every per-model timeoutMs in the registry", () => {
  const max = maxRegisteredTimeoutMs();
  assert.ok(max.value > 0, "expected at least one timeoutMs literal in the provider registry");
  assert.ok(
    DEFAULT_STREAM_ACTIVE_TIMEOUT_MS >= max.value,
    `active timeout ${DEFAULT_STREAM_ACTIVE_TIMEOUT_MS} must cover registry max ${max.value} in ${max.file}`
  );
  assert.equal(
    DEFAULT_STREAM_ACTIVE_TIMEOUT_MS,
    max.value + MAX_REGISTERED_MODEL_TIMEOUT_MARGIN_MS
  );
});
