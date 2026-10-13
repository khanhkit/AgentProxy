import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), "agentproxy-credential-settings-failure-")
);
process.env.DATA_DIR = TEST_DATA_DIR;
delete process.env.CREDENTIAL_REDACTION_ENABLED;

const core = await import("../../src/lib/db/core.ts");
const { CredentialMaskerGuardrail } = await import("../../src/lib/guardrails/credentialMasker.ts");

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("credential masker does not fail the request when settings loading fails", async () => {
  const db = core.getDbInstance();
  const originalPrepare = db.prepare;
  db.prepare = ((sql: string) => {
    if (sql.includes("FROM key_value WHERE namespace = 'settings'")) {
      throw new Error("injected settings outage");
    }
    return originalPrepare.call(db, sql);
  }) as typeof db.prepare;

  try {
    const guardrail = new CredentialMaskerGuardrail();
    const pre = await guardrail.preCall({ headers: { Authorization: "Bearer secret" } });
    const post = await guardrail.postCall({ headers: { Authorization: "Bearer secret" } });
    assert.equal(pre?.block, false);
    assert.equal(post?.block, false);
  } finally {
    db.prepare = originalPrepare;
  }
});
