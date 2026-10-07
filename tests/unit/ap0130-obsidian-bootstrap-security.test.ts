import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-obsidian-guard-"));
const dataDir = path.join(root, "data");
const siblingVault = path.join(root, "vault");
const nestedVault = path.join(dataDir, "vault");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(siblingVault, { recursive: true });
fs.mkdirSync(nestedVault, { recursive: true });
process.env.DATA_DIR = dataDir;

const { vaultPathOverlapsDataDir } = await import("../../src/lib/obsidianSync.ts");
const { isAlwaysProtectedPath } = await import("../../src/server/authz/routeGuard.ts");

test.after(() => {
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("AP-ISS-0130 Obsidian management surface is always protected", () => {
  assert.equal(isAlwaysProtectedPath("/api/settings/obsidian"), true);
  assert.equal(isAlwaysProtectedPath("/api/settings/obsidian/webdav"), true);
});

test("AP-ISS-0130 Obsidian vault cannot equal, live inside, or contain DATA_DIR", () => {
  assert.equal(vaultPathOverlapsDataDir(dataDir), true);
  assert.equal(vaultPathOverlapsDataDir(nestedVault), true);
  assert.equal(vaultPathOverlapsDataDir(root), true);
  assert.equal(vaultPathOverlapsDataDir(siblingVault), false);
});
