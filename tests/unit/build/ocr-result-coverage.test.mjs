import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const validator = path.join(repoRoot, "scripts/ci/validate-ocr-result.mjs");

async function run(result) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ocr-result-"));
  const file = path.join(dir, "result.json");
  await writeFile(file, JSON.stringify(result));
  return spawnSync(process.execPath, [validator, file], { encoding: "utf8" });
}

function result({
  status = "complete",
  terminal = status,
  selected = 2,
  completed = 2,
  failed = [],
} = {}) {
  return {
    status,
    manifest: {
      schema_version: "ocr.run-manifest/v1",
      terminal_state: terminal,
      coverage: {
        selected: Array.from({ length: selected }, (_, i) => ({
          item_id: `s${i}`,
          path: `${i}.ts`,
        })),
        completed: Array.from({ length: completed }, (_, i) => ({
          item_id: `c${i}`,
          path: `${i}.ts`,
        })),
        reused: [],
        failed,
        waived: [],
      },
    },
  };
}

test("accepts only complete OCR coverage", async () => {
  const proc = await run(result());
  assert.equal(proc.status, 0, proc.stderr);
  assert.match(proc.stdout, /OCR coverage complete: 2 selected, 0 failed/);
});

test("rejects the historical false-green partial shape", async () => {
  const proc = await run(
    result({
      status: "partial",
      terminal: "partial",
      selected: 1314,
      completed: 1261,
      failed: [
        {
          item_id: "f1",
          path: "src/sse/services/auth.ts",
          reason: "provider or subtask request failed",
        },
      ],
    })
  );
  assert.notEqual(proc.status, 0);
  assert.match(proc.stderr, /terminal state partial/i);
  assert.match(proc.stderr, /1 failed coverage item/i);
});

test("rejects result and manifest disagreement", async () => {
  const proc = await run(result({ status: "complete", terminal: "partial", failed: [] }));
  assert.notEqual(proc.status, 0);
  assert.match(proc.stderr, /terminal state partial/i);
});

test("rejects malformed or missing coverage", async () => {
  const proc = await run({ status: "complete", manifest: { terminal_state: "complete" } });
  assert.notEqual(proc.status, 0);
  assert.match(proc.stderr, /coverage/i);
});
