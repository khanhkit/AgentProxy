#!/usr/bin/env node

import { readFile } from "node:fs/promises";

function fail(message) {
  console.error(`OCR coverage validation failed: ${message}`);
  process.exitCode = 1;
}

const resultPath = process.argv[2];
if (!resultPath) {
  fail("result JSON path is required");
} else {
  try {
    const raw = await readFile(resultPath, "utf8");
    const result = JSON.parse(raw);
    const manifest = result?.manifest;
    const coverage = manifest?.coverage;

    if (!manifest || typeof manifest !== "object") {
      fail("manifest is missing");
    } else if (!coverage || typeof coverage !== "object") {
      fail("manifest coverage is missing");
    } else {
      const requiredSets = ["selected", "completed", "reused", "failed", "waived"];
      const malformed = requiredSets.find((name) => !Array.isArray(coverage[name]));
      if (malformed) {
        fail(`coverage.${malformed} must be an array`);
      } else {
        const selected = coverage.selected.length;
        const terminalCount =
          coverage.completed.length +
          coverage.reused.length +
          coverage.failed.length +
          coverage.waived.length;
        const failed = coverage.failed.length;
        const problems = [];

        if (result.status !== "complete") problems.push(`result status ${String(result.status)}`);
        if (manifest.terminal_state !== "complete") {
          problems.push(`terminal state ${String(manifest.terminal_state)}`);
        }
        if (failed !== 0) problems.push(`${failed} failed coverage item${failed === 1 ? "" : "s"}`);
        if (terminalCount !== selected) {
          problems.push(
            `coverage partition mismatch: selected=${selected}, terminal=${terminalCount}`
          );
        }

        if (problems.length > 0) {
          fail(problems.join("; "));
        } else {
          console.log(`OCR coverage complete: ${selected} selected, ${failed} failed.`);
        }
      }
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
