import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const manifestPath = path.join(repoRoot, "tests/fixtures/ap-iss-0069-provider-routing-corpus.json");

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
const requiredIds = [
  "Q09",
  "Q10",
  "Q11",
  "Q12",
  "Q15",
  "Q18",
  "Q20",
  "Q21",
  "Q22",
  "Q23",
  "Q24",
  "Q25",
  "Q26",
  "Q27",
  "Q28",
  "Q29",
  "Q30",
  "Q31",
  "Q32",
  "Q33",
  "Q34",
  "Q35",
];
const allowedClassifications = new Set([
  "VERIFIED_PROTECTED",
  "VERIFIED_MULTI_SURFACE",
  "PARTIAL_COMPOSED_GAP",
  "PARTIAL_PROVIDER_SPECIFIC_GAP",
]);

test("AP-ISS-0069 corpus covers every required provider/routing query exactly once", () => {
  assert.equal(corpus.issue, "AP-ISS-0069");
  assert.deepEqual(corpus.contracts.map((entry) => entry.id).sort(), [...requiredIds].sort());
  assert.equal(new Set(corpus.contracts.map((entry) => entry.id)).size, requiredIds.length);
});

test("AP-ISS-0069 corpus evidence is executable, additive, and classification-bounded", () => {
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

test("provider-specific inherited signatures are not overstated as verified", () => {
  const partialIds = new Set(
    corpus.contracts
      .filter((entry) => entry.classification.startsWith("PARTIAL_"))
      .map((entry) => entry.id)
  );
  for (const id of ["Q15", "Q22", "Q25", "Q27", "Q28", "Q29", "Q32", "Q33", "Q34"]) {
    assert.ok(
      partialIds.has(id),
      `${id} must remain partial until its provider-specific signature is replayed`
    );
  }
});

test("verified classifications are limited to contracts with direct regression evidence", () => {
  const verified = new Set(
    corpus.contracts
      .filter((entry) => entry.classification.startsWith("VERIFIED_"))
      .map((entry) => entry.id)
  );
  assert.deepEqual([...verified].sort(), ["Q09", "Q11", "Q12", "Q18", "Q23", "Q26", "Q31"].sort());
});
