#!/usr/bin/env node
// scripts/check/filter-codeql-in-source-suppressions.mjs
//
// Honor only suppressions that CodeQL itself emitted into SARIF as `kind: "inSource"`.
// This is intentionally generic: it does not know alert numbers, file paths, or rule IDs.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function normalizeSuppressionKind(kind) {
  return String(kind ?? "")
    .replace(/[^a-z]/gi, "")
    .toLowerCase();
}

export function hasInSourceSuppression(result) {
  return (
    Array.isArray(result?.suppressions) &&
    result.suppressions.some(
      (suppression) => normalizeSuppressionKind(suppression?.kind) === "insource"
    )
  );
}

export function filterSarifDocument(document) {
  if (!document || typeof document !== "object" || !Array.isArray(document.runs)) {
    throw new Error("Invalid SARIF document: expected an object with a runs array");
  }

  let totalResults = 0;
  let removedResults = 0;
  const removedByRule = {};

  for (const run of document.runs) {
    if (!Array.isArray(run?.results)) continue;

    const kept = [];
    for (const result of run.results) {
      totalResults += 1;
      if (hasInSourceSuppression(result)) {
        removedResults += 1;
        const ruleId = result?.ruleId ?? "unknown";
        removedByRule[ruleId] = (removedByRule[ruleId] ?? 0) + 1;
      } else {
        kept.push(result);
      }
    }
    run.results = kept;
  }

  return {
    document,
    summary: {
      totalResults,
      removedResults,
      keptResults: totalResults - removedResults,
      removedByRule,
    },
  };
}

function listSarifFiles(root) {
  const files = [];

  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (
        entry.isFile() &&
        (entry.name.endsWith(".sarif") || entry.name.endsWith(".sarif.json"))
      ) {
        files.push(absolute);
      }
    }
  }

  visit(root);
  return files.sort();
}

export function filterSarifDirectory(inputDir, outputDir) {
  const sourceRoot = path.resolve(inputDir);
  const destinationRoot = path.resolve(outputDir);

  if (sourceRoot === destinationRoot) {
    throw new Error("Input and output SARIF directories must differ");
  }
  if (!existsSync(sourceRoot) || !statSync(sourceRoot).isDirectory()) {
    throw new Error(`SARIF input directory does not exist: ${sourceRoot}`);
  }

  const files = listSarifFiles(sourceRoot);
  if (files.length === 0) {
    throw new Error(`No SARIF files found under: ${sourceRoot}`);
  }

  const aggregate = {
    files: 0,
    totalResults: 0,
    removedResults: 0,
    keptResults: 0,
    removedByRule: {},
  };

  for (const sourceFile of files) {
    const relative = path.relative(sourceRoot, sourceFile);
    const destinationFile = path.join(destinationRoot, relative);
    const parsed = JSON.parse(readFileSync(sourceFile, "utf8"));
    const { document, summary } = filterSarifDocument(parsed);

    mkdirSync(path.dirname(destinationFile), { recursive: true });
    writeFileSync(destinationFile, `${JSON.stringify(document, null, 2)}\n`, "utf8");

    aggregate.files += 1;
    aggregate.totalResults += summary.totalResults;
    aggregate.removedResults += summary.removedResults;
    aggregate.keptResults += summary.keptResults;
    for (const [ruleId, count] of Object.entries(summary.removedByRule)) {
      aggregate.removedByRule[ruleId] = (aggregate.removedByRule[ruleId] ?? 0) + count;
    }
  }

  return aggregate;
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  const [inputDir, outputDir] = process.argv.slice(2);
  if (!inputDir || !outputDir) {
    process.stderr.write(
      "Usage: node scripts/check/filter-codeql-in-source-suppressions.mjs <input-dir> <output-dir>\n"
    );
    process.exitCode = 2;
  } else {
    try {
      const summary = filterSarifDirectory(inputDir, outputDir);
      process.stdout.write(`${JSON.stringify(summary)}\n`);
    } catch (error) {
      process.stderr.write(
        `[codeql-sarif-filter] ${error instanceof Error ? error.message : String(error)}\n`
      );
      process.exitCode = 1;
    }
  }
}
