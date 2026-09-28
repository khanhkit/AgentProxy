import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relPath: string): string {
  return readFileSync(path.join(root, relPath), "utf8");
}

test("both published Docker runtime stages default REQUIRE_API_KEY=true", () => {
  const dockerfile = read("Dockerfile");
  const matches = dockerfile.match(/^ENV REQUIRE_API_KEY=true$/gm) ?? [];
  assert.equal(
    matches.length,
    2,
    "runner-debian-base and runner-base must both preserve authenticated deployment posture"
  );
});

test("fly.toml defaults REQUIRE_API_KEY=true for the public Fly deployment", () => {
  assert.match(read("fly.toml"), /^\s*REQUIRE_API_KEY\s*=\s*"true"\s*$/m);
});

test("repository local-first feature default remains false", () => {
  assert.match(
    read("src/shared/constants/featureFlagDefinitions.ts"),
    /key:\s*"REQUIRE_API_KEY"[\s\S]{0,240}?defaultValue:\s*"false"/
  );
});
