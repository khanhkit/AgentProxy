import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(root, "contrib", "podman", "omniroute.container");
const readmePath = path.join(root, "contrib", "podman", "README.md");

test("Podman Quadlet does not ship literal management or signing secrets", () => {
  const content = fs.readFileSync(manifestPath, "utf8");

  assert.doesNotMatch(content, /change-me-to-a-random/i);
  for (const variable of ["JWT_SECRET", "API_KEY_SECRET", "INITIAL_PASSWORD"]) {
    assert.doesNotMatch(
      content,
      new RegExp(`^Environment=${variable}=\\S+`, "m"),
      `${variable} must be loaded from an operator-owned environment file`
    );
  }
});

test("Podman guide requires generated secrets before first start", () => {
  const readme = fs.readFileSync(readmePath, "utf8");
  assert.match(readme, /Generate secrets before first start/i);
  assert.match(readme, /openssl rand/);
  assert.match(readme, /Keep that `.env` private/i);
});
