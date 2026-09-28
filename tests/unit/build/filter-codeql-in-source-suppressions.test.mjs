// tests/unit/build/filter-codeql-in-source-suppressions.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  filterSarifDirectory,
  filterSarifDocument,
  hasInSourceSuppression,
} from "../../../scripts/check/filter-codeql-in-source-suppressions.mjs";

function result(ruleId, suppressions) {
  const value = {
    ruleId,
    message: { text: `${ruleId} finding` },
    locations: [],
  };
  if (suppressions !== undefined) value.suppressions = suppressions;
  return value;
}

test("hasInSourceSuppression recognizes only CodeQL in-source suppression kind", () => {
  assert.equal(hasInSourceSuppression(result("js/a", [{ kind: "inSource" }])), true);
  assert.equal(hasInSourceSuppression(result("js/a", [{ kind: "IN_SOURCE" }])), true);
  assert.equal(hasInSourceSuppression(result("js/a", [{ kind: "external" }])), false);
  assert.equal(hasInSourceSuppression(result("js/a")), false);
});

test("filterSarifDocument removes only explicitly in-source suppressed results", () => {
  const input = {
    version: "2.1.0",
    runs: [
      {
        results: [
          result("js/suppressed", [{ kind: "inSource", justification: "source annotation" }]),
          result("js/external", [{ kind: "external" }]),
          result("js/open"),
        ],
      },
    ],
  };

  const { document, summary } = filterSarifDocument(input);
  assert.deepEqual(
    document.runs[0].results.map((item) => item.ruleId),
    ["js/external", "js/open"]
  );
  assert.deepEqual(summary, {
    totalResults: 3,
    removedResults: 1,
    keptResults: 2,
    removedByRule: { "js/suppressed": 1 },
  });
});

test("filterSarifDocument preserves runs without results and rejects malformed SARIF", () => {
  const input = { version: "2.1.0", runs: [{ tool: {} }, { results: [] }] };
  const { summary } = filterSarifDocument(input);
  assert.equal(summary.totalResults, 0);
  assert.throws(() => filterSarifDocument({}), /runs array/);
});

test("filterSarifDirectory preserves relative file layout and aggregates removals", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "agentproxy-codeql-filter-"));
  const input = path.join(root, "input");
  const output = path.join(root, "output");
  mkdirSync(path.join(input, "nested"), { recursive: true });

  writeFileSync(
    path.join(input, "javascript.sarif"),
    JSON.stringify({
      version: "2.1.0",
      runs: [{ results: [result("js/a", [{ kind: "inSource" }]), result("js/b")] }],
    })
  );
  writeFileSync(
    path.join(input, "nested", "actions.sarif.json"),
    JSON.stringify({
      version: "2.1.0",
      runs: [{ results: [result("actions/c", [{ kind: "inSource" }])] }],
    })
  );
  writeFileSync(path.join(input, "ignore.txt"), "not sarif");

  try {
    const summary = filterSarifDirectory(input, output);
    assert.deepEqual(summary, {
      files: 2,
      totalResults: 3,
      removedResults: 2,
      keptResults: 1,
      removedByRule: { "js/a": 1, "actions/c": 1 },
    });

    const js = JSON.parse(readFileSync(path.join(output, "javascript.sarif"), "utf8"));
    assert.deepEqual(
      js.runs[0].results.map((item) => item.ruleId),
      ["js/b"]
    );

    const actions = JSON.parse(
      readFileSync(path.join(output, "nested", "actions.sarif.json"), "utf8")
    );
    assert.deepEqual(actions.runs[0].results, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("filterSarifDirectory fails closed for missing input, same paths, or no SARIF files", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "agentproxy-codeql-filter-empty-"));
  const empty = path.join(root, "empty");
  mkdirSync(empty, { recursive: true });
  try {
    assert.throws(
      () => filterSarifDirectory(path.join(root, "missing"), path.join(root, "out")),
      /does not exist/
    );
    assert.throws(() => filterSarifDirectory(empty, empty), /must differ/);
    assert.throws(() => filterSarifDirectory(empty, path.join(root, "out")), /No SARIF files/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
