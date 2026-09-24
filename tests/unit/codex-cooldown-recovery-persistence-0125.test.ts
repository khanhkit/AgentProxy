import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const recoveryPath = path.join(root, "src/lib/db/providers/codexAccountRecovery.ts");
const limits = fs.readFileSync(path.join(root, "src/lib/usage/providerLimits.ts"), "utf8");

test("TC-OMNIDB-CODEX-055A: recovery mutation is account-scoped atomic and backup-before-write", () => {
  assert.ok(fs.existsSync(recoveryPath));
  const src = fs.readFileSync(recoveryPath, "utf8");
  assert.match(src, /db\.transaction\(\(\) => \{/);
  assert.match(src, /if \(connection\.provider !== "codex"\) return null/);
  assert.match(src, /backupDbFile\("pre-write"\)/);
  assert.match(src, /UPDATE provider_connections SET provider_specific_data = \?, updated_at = \? WHERE id = \?/);
  assert.match(src, /invalidateDbCache\("connections"\)/);
});

test("TC-OMNIDB-CODEX-055B: manual release clears only one Codex child scope", () => {
  assert.ok(fs.existsSync(recoveryPath));
  const src = fs.readFileSync(recoveryPath, "utf8");
  assert.match(src, /export async function clearCodexAccountCooldown\(id: string, scope: Scope = "codex"\)/);
  assert.match(src, /delete values\[scope\]/);
  assert.match(src, /"codexScopeRateLimitedUntil"/);
  assert.match(src, /"codexScopeRateLimitSource"/);
  assert.match(src, /"codexExhaustedWindowByScope"/);
});

test("TC-OMNIDB-CODEX-055C: live quota observation uses expected-state CAS and dual-window headroom", () => {
  assert.ok(fs.existsSync(recoveryPath));
  const src = fs.readFileSync(recoveryPath, "utf8");
  assert.match(src, /export async function syncCodexQuotaObservation/);
  assert.match(src, /const before = toRecord\(expected\)/);
  assert.match(src, /"codexQuotaStateByScope"/);
  assert.match(src, /JSON\.stringify\(toRecord\(data\[key\]\)\[scope\]\) !==/);
  assert.match(src, /valid\(session\) &&\s*valid\(weekly\)/s);
  assert.match(src, /Number\(session\.used\) < Number\(session\.total\)/);
  assert.match(src, /Number\(weekly\.used\) < Number\(weekly\.total\)/);
});

test("TC-OMNIDB-CODEX-055D: quota snapshots hydrate both Codex and Spark projections", () => {
  assert.ok(fs.existsSync(recoveryPath));
  const src = fs.readFileSync(recoveryPath, "utf8");
  assert.match(src, /for \(const scope of \["codex", "spark"\] as const\)/);
  assert.match(src, /scope === "spark" \? "gpt_5_3_codex_spark_" : ""/);
  assert.match(src, /usage\$\{suffix\}/);
  assert.match(src, /limit\$\{suffix\}/);
  assert.match(src, /resetAt\$\{suffix\}/);
});

test("TC-OMNIDB-CODEX-055E: provider-limits live fetch persists observation before downstream recovery", () => {
  assert.match(limits, /import \{ syncCodexQuotaObservation \} from "@\/lib\/db\/providers\/codexAccountRecovery"/);
  assert.match(limits, /if \(connection\.provider === "codex"\) \{/);
  assert.match(limits, /syncCodexQuotaObservation\(\s*connection\.id,\s*result\.usage,\s*connection\.providerSpecificData/s);
  const syncPos = limits.indexOf("syncCodexQuotaObservation(");
  const clearPos = limits.indexOf("maybeClearRecoveredQuotaState(connection, result.usage)");
  assert.ok(syncPos >= 0 && clearPos > syncPos);
});
