import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("UncloseAI registry exposes only the rotated live model", () => {
  const source = read("open-sse/config/providers/registry/uncloseai/index.ts");
  assert.ok(source.includes("Lorbus/Qwen3.6-27B-int4-AutoRound"));
  assert.equal(source.includes("adamo1139/Hermes-3-Llama-3.1-8B-FP8-Dynamic"), false);
  assert.equal(source.includes("qwen3.6:27b"), false);
  assert.equal(source.includes("gemma4:31b"), false);
});

test("free-model catalog mirrors the UncloseAI live roster", () => {
  const source = read("open-sse/config/freeModelCatalog.data.ts");
  const uncloseLines = source.split("\n").filter((line) => line.includes('provider: "uncloseai"'));
  assert.equal(uncloseLines.length, 1);
  assert.ok((uncloseLines[0] ?? "").includes("Lorbus/Qwen3.6-27B-int4-AutoRound"));
});

test("no-auth guidance names the same verified live model", () => {
  const source = read("src/shared/constants/providers/noauth.ts");
  assert.ok(source.includes("verified live model: Lorbus/Qwen3.6-27B-int4-AutoRound"));
});
