import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = await fs.mkdtemp(path.join(os.homedir(), ".agentproxy-backup-restore-test-"));
const dataDir = path.join(root, "data");
process.env.DATA_DIR = dataDir;
process.env.CLI_CONFIG_HOME = root;

const backupService = await import("../../src/shared/services/backupService.ts");
const { getCliConfigPaths } = await import("../../src/shared/services/cliRuntime.ts");

after(async () => {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 25 });
});

async function makeCodexFixture() {
  await fs.rm(path.join(dataDir, "backups", "codex"), { recursive: true, force: true });
  await fs.rm(path.join(root, ".codex"), { recursive: true, force: true });

  const paths = getCliConfigPaths("codex");
  assert.ok(paths?.config);
  const target = paths.config;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, "before-backup", "utf8");
  const backupPath = await backupService.createBackup("codex", target);
  assert.ok(backupPath);
  await fs.writeFile(target, "after-backup", "utf8");
  return {
    target,
    backupPath,
    backupId: path.basename(backupPath),
    metaPath: `${backupPath}.meta.json`,
  };
}

async function readMeta(metaPath: string) {
  return JSON.parse(await fs.readFile(metaPath, "utf8")) as Record<string, unknown>;
}

async function writeMeta(metaPath: string, meta: Record<string, unknown>) {
  await fs.writeFile(metaPath, JSON.stringify(meta), "utf8");
}

test("AP-ISS-0041 valid legacy metadata restores the canonical tool target", async () => {
  const fixture = await makeCodexFixture();
  const result = await backupService.restoreBackup("codex", fixture.backupId);
  assert.equal(result.originalPath, fixture.target);
  assert.equal(await fs.readFile(fixture.target, "utf8"), "before-backup");
});

test("AP-ISS-0041 rejects tampered metadata destination before filesystem mutation", async () => {
  const fixture = await makeCodexFixture();
  const attackerTarget = path.join(root, "attacker", "owned.txt");
  const meta = await readMeta(fixture.metaPath);
  meta.originalPath = attackerTarget;
  await writeMeta(fixture.metaPath, meta);

  await assert.rejects(
    () => backupService.restoreBackup("codex", fixture.backupId),
    /canonical tool path/
  );
  await assert.rejects(() => fs.access(attackerTarget));
  assert.equal(await fs.readFile(fixture.target, "utf8"), "after-backup");
});

test("AP-ISS-0041 rejects metadata bound to a different tool identity", async () => {
  const fixture = await makeCodexFixture();
  const meta = await readMeta(fixture.metaPath);
  meta.toolId = "claude";
  await writeMeta(fixture.metaPath, meta);

  await assert.rejects(() => backupService.restoreBackup("codex", fixture.backupId), /tool mismatch/);
  assert.equal(await fs.readFile(fixture.target, "utf8"), "after-backup");
});

test("AP-ISS-0041 rejects traversal-equivalent noncanonical metadata", async () => {
  const fixture = await makeCodexFixture();
  const meta = await readMeta(fixture.metaPath);
  meta.originalPath = `${path.dirname(fixture.target)}${path.sep}child${path.sep}..${path.sep}${path.basename(fixture.target)}`;
  await writeMeta(fixture.metaPath, meta);

  await assert.rejects(() => backupService.restoreBackup("codex", fixture.backupId), /noncanonical/);
  assert.equal(await fs.readFile(fixture.target, "utf8"), "after-backup");
});

test("AP-ISS-0041 rejects a symlinked canonical parent before restore copy", async () => {
  const fixture = await makeCodexFixture();
  const canonicalDir = path.dirname(fixture.target);
  const savedDir = `${canonicalDir}-saved`;
  const outsideDir = path.join(root, "outside-codex");
  await fs.rename(canonicalDir, savedDir);
  await fs.mkdir(outsideDir, { recursive: true });
  const outsideTarget = path.join(outsideDir, path.basename(fixture.target));
  await fs.writeFile(outsideTarget, "outside-current", "utf8");
  await fs.symlink(outsideDir, canonicalDir, process.platform === "win32" ? "junction" : "dir");

  await assert.rejects(
    () => backupService.restoreBackup("codex", fixture.backupId),
    /symbolic-link or junction/
  );
  assert.equal(await fs.readFile(outsideTarget, "utf8"), "outside-current");
});
