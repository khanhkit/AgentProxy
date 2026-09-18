import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

type PackageJson = {
  overrides?: Record<string, unknown>;
};

type LockPackage = {
  version?: string;
};

type PackageLock = {
  packages?: Record<string, LockPackage>;
};

test("AP-ISS-0113 pins markdownlint-cli2 away from vulnerable smol-toml 1.7.0", () => {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as PackageJson;
  const packageLock = JSON.parse(fs.readFileSync("package-lock.json", "utf8")) as PackageLock;

  const markdownlintOverride = packageJson.overrides?.["markdownlint-cli2"] as
    Record<string, unknown> | undefined;
  assert.equal(markdownlintOverride?.["smol-toml"], "^1.8.0");

  const smolTomlNodes = Object.entries(packageLock.packages ?? {}).filter(([path]) =>
    path.endsWith("/smol-toml")
  );
  assert.ok(smolTomlNodes.length > 0, "lockfile must contain a smol-toml resolution");

  for (const [path, metadata] of smolTomlNodes) {
    assert.notEqual(
      metadata.version,
      "1.7.0",
      path + " must not resolve vulnerable smol-toml 1.7.0"
    );
  }

  assert.equal(packageLock.packages?.["node_modules/smol-toml"]?.version, "1.8.0");
  assert.equal(
    packageLock.packages?.["node_modules/markdownlint-cli2/node_modules/smol-toml"],
    undefined,
    "markdownlint-cli2 should dedupe onto the patched root smol-toml resolution"
  );
});
