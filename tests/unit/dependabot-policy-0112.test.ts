import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { load } from "js-yaml";

type GroupPolicy = {
  "dependency-type"?: string;
  "update-types"?: string[];
  "exclude-patterns"?: string[];
};

type IgnorePolicy = {
  "dependency-name"?: string;
  "update-types"?: string[];
};

type UpdatePolicy = {
  "package-ecosystem"?: string;
  directory?: string;
  "rebase-strategy"?: string;
  groups?: Record<string, GroupPolicy>;
  ignore?: IgnorePolicy[];
};

type DependabotPolicy = {
  version?: number;
  updates?: UpdatePolicy[];
};

const policyPath = path.resolve(".github/dependabot.yml");
const policy = load(fs.readFileSync(policyPath, "utf8")) as DependabotPolicy;

test("TC-DEPBOT-POLICY-0112 keeps routine npm updates isolated and actionable", () => {
  const rootNpm = (policy.updates ?? []).filter(
    (update) => update["package-ecosystem"] === "npm" && update.directory === "/"
  );

  assert.equal(rootNpm.length, 1, "expected exactly one root npm Dependabot entry");
  const update = rootNpm[0];

  assert.equal(update["rebase-strategy"], "auto");

  for (const groupName of ["production", "development"]) {
    const group = update.groups?.[groupName];
    assert.ok(group, "missing " + groupName + " dependency group");
    assert.deepEqual(
      [...(group["update-types"] ?? [])].sort(),
      ["minor", "patch"],
      groupName + " routine group must not absorb semver-major updates"
    );
  }

  assert.deepEqual(
    [...(update.groups?.fumadocs?.patterns ?? [])].sort(),
    ["fumadocs-core", "fumadocs-ui"],
    "Fumadocs core/UI must move together in a dedicated review unit"
  );
  assert.deepEqual(
    [...(update.groups?.fumadocs?.["update-types"] ?? [])].sort(),
    ["minor", "patch"],
    "Fumadocs routine group must not absorb semver-major updates"
  );
  assert.ok(
    update.groups?.production?.["exclude-patterns"]?.includes("fumadocs-ui"),
    "fumadocs-ui must stay outside the production mega-group because its cn binary changes CLI detection"
  );

  const vitestMajor = (update.ignore ?? []).find(
    (rule) =>
      rule["dependency-name"] === "vitest" &&
      rule["update-types"]?.includes("version-update:semver-major")
  );
  assert.ok(
    vitestMajor,
    "Vitest majors must remain intentional until the repository directly owns a compatible Vite dependency"
  );
});
