import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  evaluateMainOnlyBranches,
  parseGhBranchNames,
  parseGitRemoteHeads,
} from "../../scripts/check/check-release-branch-hygiene.mjs";

test("release branch hygiene accepts exactly main", () => {
  assert.deepEqual(evaluateMainOnlyBranches(["main"]), {
    ok: true,
    branches: ["main"],
    hasMain: true,
    unexpected: [],
  });
});

test("release branch hygiene rejects extra feature branches", () => {
  const result = evaluateMainOnlyBranches([
    "kitdev1/omniroute-product-runtime-0124",
    "main",
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.hasMain, true);
  assert.deepEqual(result.unexpected, ["kitdev1/omniroute-product-runtime-0124"]);
});

test("release branch hygiene fails closed when main is absent", () => {
  const result = evaluateMainOnlyBranches([]);
  assert.equal(result.ok, false);
  assert.equal(result.hasMain, false);
});

test("git remote parser handles slash branch names and deduplicates", () => {
  const output = [
    "1111111111111111111111111111111111111111\trefs/heads/main",
    "2222222222222222222222222222222222222222\trefs/heads/kitdev3/release-main-only",
    "2222222222222222222222222222222222222222\trefs/heads/kitdev3/release-main-only",
    "",
  ].join("\n");
  assert.deepEqual(parseGitRemoteHeads(output), [
    "kitdev3/release-main-only",
    "main",
  ]);
});

test("git remote parser rejects malformed authority output", () => {
  assert.throws(
    () => parseGitRemoteHeads("not-a-head"),
    /unexpected git ls-remote output/u
  );
});

test("GitHub API branch parser normalizes newline output", () => {
  assert.deepEqual(parseGhBranchNames("main\nfeature/x\nmain\n"), [
    "feature/x",
    "main",
  ]);
});

test("all release entrypoints enforce the main-only branch invariant", () => {
  const packageJson = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8")
  );
  assert.equal(
    packageJson.scripts["check:release-branch-hygiene"],
    "node scripts/check/check-release-branch-hygiene.mjs"
  );
  assert.match(
    packageJson.scripts.prepublishOnly,
    /^npm run check:release-branch-hygiene &&/u
  );

  const validator = readFileSync(
    new URL("../../scripts/quality/validate-release-green.mjs", import.meta.url),
    "utf8"
  );
  assert.match(
    validator,
    /hardCmd\([\s\S]*?"release-branch-hygiene"[\s\S]*?check:release-branch-hygiene/u
  );

  const dockerPublish = readFileSync(
    new URL("../../.github/workflows/docker-publish.yml", import.meta.url),
    "utf8"
  );
  assert.match(dockerPublish, /Enforce main-only release branch invariant/u);
  assert.match(dockerPublish, /check-release-branch-hygiene\.mjs/u);

  const nativeRelease = readFileSync(
    new URL("../../.github/workflows/release-platforms.yml", import.meta.url),
    "utf8"
  );
  assert.match(nativeRelease, /Enforce main-only release branch invariant/u);
  assert.match(nativeRelease, /check-release-branch-hygiene\.mjs/u);
  assert.match(
    nativeRelease,
    /github\.event_name == 'release' \|\| inputs\.publish_assets == true/u
  );
});
