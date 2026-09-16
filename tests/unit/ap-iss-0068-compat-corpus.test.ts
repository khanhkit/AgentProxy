import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const manifestPath = path.join(repoRoot, "tests/fixtures/ap-iss-0068-compat-corpus.json");

type Contract = {
  id: string;
  name: string;
  classification: string;
  evidence: string[];
  note?: string;
};

type Corpus = {
  issue: string;
  purpose: string;
  contracts: Contract[];
};

const corpus = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Corpus;
const requiredIds = ["Q06", "Q07", "Q08", "Q16", "Q17", "Q23", "Q26", "Q36", "Q37", "Q38"];
const allowedClassifications = new Set([
  "VERIFIED_PROTECTED",
  "PARTIAL_COMPOSED_GAP",
  "VERIFIED_MULTI_SURFACE",
  "PARTIAL_PROVIDER_SPECIFIC_GAP",
]);

test("AP-ISS-0068 corpus covers every required inherited compatibility contract exactly once", () => {
  assert.equal(corpus.issue, "AP-ISS-0068");
  assert.deepEqual(corpus.contracts.map((entry) => entry.id).sort(), [...requiredIds].sort());
  assert.equal(new Set(corpus.contracts.map((entry) => entry.id)).size, requiredIds.length);
});

test("AP-ISS-0068 corpus evidence is executable, additive, and classification-bounded", () => {
  for (const contract of corpus.contracts) {
    assert.ok(allowedClassifications.has(contract.classification), `${contract.id} classification`);
    assert.ok(contract.evidence.length > 0, `${contract.id} must name executable evidence`);
    for (const relativePath of contract.evidence) {
      assert.match(relativePath, /^tests\//, `${contract.id} evidence must stay test-only`);
      assert.ok(
        fs.existsSync(path.join(repoRoot, relativePath)),
        `${contract.id}: missing ${relativePath}`
      );
    }
  }
});

test("Q07 remains explicitly partial until keepalive + dynamic error are replayed end-to-end", () => {
  const q07 = corpus.contracts.find((entry) => entry.id === "Q07");
  assert.ok(q07);
  assert.equal(q07.classification, "PARTIAL_COMPOSED_GAP");
  assert.match(q07.note ?? "", /post-keepalive dynamic-error sequence/i);
});

test("Q36 remains explicitly partial until the provider-specific Persian/Arabic path is replayed", () => {
  const q36 = corpus.contracts.find((entry) => entry.id === "Q36");
  assert.ok(q36);
  assert.equal(q36.classification, "PARTIAL_PROVIDER_SPECIFIC_GAP");
  assert.match(q36.note ?? "", /Persian\/Arabic/i);
});
