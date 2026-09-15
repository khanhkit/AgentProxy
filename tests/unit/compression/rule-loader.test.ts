import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import {
  getAvailableLanguagePacks,
  loadAllRulesForLanguage,
  loadRulePack,
  validateRulePack,
} from "../../../open-sse/services/compression/ruleLoader.ts";
import { getRulesForContext } from "../../../open-sse/services/compression/cavemanRules.ts";

describe("Caveman file-based rule loader", () => {
  it("does not route rule-loader unit imports through the full compression barrel", () => {
    const source = fs.readFileSync(fileURLToPath(import.meta.url), "utf8");
    const importPreamble = source.slice(0, source.indexOf("\ndescribe("));
    const compressionBarrel = ["../../../open-sse/services/compression", "index.ts"].join("/");

    assert.equal(
      importPreamble.includes(`from "${compressionBarrel}"`),
      false,
      "rule-loader unit tests must import ruleLoader.ts directly instead of eagerly loading the full compression barrel"
    );
  });

  it("keeps the rule-loader suite free of the heavyweight caveman runtime import", () => {
    const source = fs.readFileSync(fileURLToPath(import.meta.url), "utf8");
    const importPreamble = source.slice(0, source.indexOf("\ndescribe("));
    const cavemanRuntime = ["../../../open-sse/services/compression", "caveman.ts"].join("/");

    assert.equal(
      importPreamble.includes(`from "${cavemanRuntime}"`),
      false,
      "rule-loader unit tests must stay loader-only; caveman integration assertions belong in an existing caveman suite"
    );
  });

  it("loads English rule packs by category", () => {
    assert.equal(loadRulePack("en", "filler", { refresh: true }).length, 14);
    assert.ok(loadRulePack("en", "context", { refresh: true }).length >= 8);
    assert.ok(loadRulePack("en", "structural", { refresh: true }).length >= 7);
    assert.ok(loadRulePack("en", "dedup", { refresh: true }).length >= 4);
    assert.ok(loadRulePack("en", "ultra", { refresh: true }).length >= 1);
  });

  it("loads all English rules and lists metadata", () => {
    const rules = loadAllRulesForLanguage("en", { refresh: true });
    const packs = getAvailableLanguagePacks();

    assert.ok(rules.length >= 31, `Expected 31+ rules, got ${rules.length}`);
    assert.ok(packs.some((pack) => pack.language === "en" && pack.ruleCount >= 31));
  });

  it("validates rule pack structure", () => {
    assert.equal(
      validateRulePack({
        language: "xx",
        category: "filler",
        rules: [{ name: "x", pattern: "\\\\btest\\\\b", replacement: "" }],
      }).valid,
      true
    );
    assert.equal(
      validateRulePack({ language: "xx", category: "filler", rules: [{}] }).valid,
      false
    );
  });

  it("validates flags and replacement maps", () => {
    assert.equal(
      validateRulePack({
        language: "xx",
        category: "context",
        rules: [
          {
            name: "mapped",
            pattern: "\\b(?:one|two)\\b",
            flags: "g",
            replacementMap: { one: "1", two: "2" },
          },
        ],
      }).valid,
      true
    );
    assert.equal(
      validateRulePack({
        language: "xx",
        category: "context",
        rules: [
          {
            name: "bad_map",
            pattern: "\\b(?:one|two)\\b",
            replacementMap: { one: 1 },
          },
        ],
      }).valid,
      false
    );
  });

  it("falls back to hardcoded rules when language pack is missing", () => {
    const rules = getRulesForContext("user", "full", "missing-language");
    assert.ok(rules.some((rule) => rule.name === "polite_framing"));
  });
});
