import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const SCRIPT = join(ROOT, "scripts/check/check-github-governance.mjs");

function baseProtection() {
  return {
    enforce_admins: { enabled: true },
    required_status_checks: {
      strict: true,
      contexts: ["Quality Ratchet", "Security Tests"],
      checks: [
        { context: "Quality Ratchet", app_id: 15368 },
        { context: "Security Tests", app_id: 15368 },
      ],
    },
    required_pull_request_reviews: {
      dismiss_stale_reviews: true,
      require_code_owner_reviews: false,
      require_last_push_approval: true,
      required_approving_review_count: 1,
    },
    required_conversation_resolution: { enabled: true },
    required_linear_history: { enabled: true },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
  };
}

function runCli(protection: Record<string, unknown>) {
  const fakeDir = mkdtempSync(join(tmpdir(), "ap0109-gh-"));
  const ghPath = join(fakeDir, "gh");
  const fakeGh = `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "repo" && args[1] === "view") {
  process.stdout.write("khanhkit/AgentProxy\\n");
  process.exit(0);
}
if (args[0] === "api" && args[1] === "repos/khanhkit/AgentProxy/branches/main/protection") {
  process.stdout.write(process.env.FAKE_PROTECTION_JSON || "{}");
  process.exit(0);
}
process.stderr.write("unexpected fake gh invocation: " + args.join(" ") + "\\n");
process.exit(2);
`;
  writeFileSync(ghPath, fakeGh, "utf8");
  chmodSync(ghPath, 0o755);

  try {
    return spawnSync(process.execPath, [SCRIPT, "--json"], {
      cwd: ROOT,
      env: {
        ...process.env,
        PATH: `${fakeDir}:${process.env.PATH ?? ""}`,
        FAKE_PROTECTION_JSON: JSON.stringify(protection),
      },
      encoding: "utf8",
      timeout: 10_000,
    });
  } finally {
    rmSync(fakeDir, { recursive: true, force: true });
  }
}

test("AP-0109 CLI: exact desired governance exits zero", () => {
  const result = runCli(baseProtection());
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.failures, []);
});

test("AP-0109 CLI: admin bypass exits non-zero", () => {
  const result = runCli({
    ...baseProtection(),
    enforce_admins: { enabled: false },
  });
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.failures.includes("enforce_admins"));
});

test("AP-0109 CLI: absent required checks exits non-zero", () => {
  const result = runCli({
    ...baseProtection(),
    required_status_checks: null,
  });
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.failures.includes("required_status_checks"));
});
