import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { evaluateCodeOwners } from "../../../scripts/check/check-github-governance.mjs";

const policy = {
  codeOwners: {
    mode: "absent",
  },
};

test("TC-GITHUB-CODEOWNERS-0128 absent mode passes only when CODEOWNERS is absent", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ap0128-codeowners-"));
  try {
    assert.deepEqual(evaluateCodeOwners(root, policy), { ok: true, failures: [] });

    fs.mkdirSync(path.join(root, ".github"), { recursive: true });
    fs.writeFileSync(path.join(root, ".github", "CODEOWNERS"), "* @stale-owner\n");

    assert.deepEqual(evaluateCodeOwners(root, policy), {
      ok: false,
      failures: ["codeowners_should_be_absent"],
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
