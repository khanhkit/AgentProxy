import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { runSetupClineCommand } from "../../../bin/cli/commands/setup-cline.mjs";
import { runSetupKiloCommand } from "../../../bin/cli/commands/setup-kilo.mjs";
import { runSetupRooCommand } from "../../../bin/cli/commands/setup-roo.mjs";

function mode(filePath: string): number {
  return fs.statSync(filePath).mode & 0o777;
}

async function withPermissiveUmask(fn: () => Promise<void>) {
  const oldUmask = process.umask(0);
  try {
    await fn();
  } finally {
    process.umask(oldUmask);
  }
}

test("setup-cline writes secrets.json owner-only under permissive umask", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-cline-secret-mode-"));
  try {
    await withPermissiveUmask(async () => {
      const clineDir = path.join(root, "cline-data");
      const code = await runSetupClineCommand({
        remote: "http://127.0.0.1:20128",
        apiKey: "sk-test-cline",
        model: "test-model",
        yes: true,
        clineDir,
        allowContainerWrite: true,
      });
      assert.equal(code, 0);
      assert.equal(mode(path.join(clineDir, "secrets.json")), 0o600);
      assert.equal(
        mode(clineDir) & 0o022,
        0,
        "Cline credential parent must not be shared-writable"
      );
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("setup-kilo writes auth.json and API-key-bearing VS Code settings owner-only", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-kilo-secret-mode-"));
  try {
    await withPermissiveUmask(async () => {
      const authPath = path.join(root, "kilo", "auth.json");
      const vscodeDir = path.join(root, "Code", "User");
      const vscodePath = path.join(vscodeDir, "settings.json");
      fs.mkdirSync(vscodeDir, { recursive: true, mode: 0o700 });
      fs.chmodSync(vscodeDir, 0o700);
      fs.writeFileSync(vscodePath, "{}\n", { mode: 0o644 });

      const code = await runSetupKiloCommand({
        remote: "http://127.0.0.1:20128",
        apiKey: "sk-test-kilo",
        model: "test-model",
        yes: true,
        authPath,
        vscodeSettings: vscodePath,
        allowContainerWrite: true,
      });
      assert.equal(code, 0);
      assert.equal(mode(authPath), 0o600);
      assert.equal(mode(vscodePath), 0o600);
      assert.equal(
        mode(path.dirname(authPath)) & 0o022,
        0,
        "Kilo auth parent must not be shared-writable"
      );
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("setup-roo writes the API-key import document owner-only", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-roo-secret-mode-"));
  try {
    await withPermissiveUmask(async () => {
      const importPath = path.join(root, "roo", "roo-settings.json");
      const code = await runSetupRooCommand({
        remote: "http://127.0.0.1:20128",
        apiKey: "sk-test-roo",
        model: "test-model",
        yes: true,
        importPath,
        vscodeSettings: path.join(root, "missing-vscode-settings.json"),
        allowContainerWrite: true,
      });
      assert.equal(code, 0);
      assert.equal(mode(importPath), 0o600);
      assert.equal(
        mode(path.dirname(importPath)) & 0o022,
        0,
        "Roo import parent must not be shared-writable"
      );
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("CLI setup --dry-run never repairs or rewrites existing secret files", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-setup-dry-run-mode-"));
  try {
    const clineDir = path.join(root, "cline");
    fs.mkdirSync(clineDir, { recursive: true, mode: 0o700 });
    const clineSecret = path.join(clineDir, "secrets.json");
    fs.writeFileSync(clineSecret, '{"openAiApiKey":"existing"}\n', { mode: 0o666 });
    fs.chmodSync(clineSecret, 0o666);

    const kiloDir = path.join(root, "kilo");
    fs.mkdirSync(kiloDir, { recursive: true, mode: 0o700 });
    const kiloAuth = path.join(kiloDir, "auth.json");
    fs.writeFileSync(kiloAuth, '{"openai-compatible":{"apiKey":"existing"}}\n', { mode: 0o666 });
    fs.chmodSync(kiloAuth, 0o666);

    const rooDir = path.join(root, "roo");
    fs.mkdirSync(rooDir, { recursive: true, mode: 0o700 });
    const rooImport = path.join(rooDir, "roo-settings.json");
    fs.writeFileSync(rooImport, '{"existing":true}\n', { mode: 0o666 });
    fs.chmodSync(rooImport, 0o666);

    assert.equal(
      await runSetupClineCommand({
        remote: "http://127.0.0.1:20128",
        apiKey: "sk-dry",
        model: "test-model",
        yes: true,
        dryRun: true,
        clineDir,
        allowContainerWrite: true,
      }),
      0
    );
    assert.equal(
      await runSetupKiloCommand({
        remote: "http://127.0.0.1:20128",
        apiKey: "sk-dry",
        model: "test-model",
        yes: true,
        dryRun: true,
        authPath: kiloAuth,
        vscodeSettings: path.join(root, "missing-vscode-settings.json"),
        allowContainerWrite: true,
      }),
      0
    );
    assert.equal(
      await runSetupRooCommand({
        remote: "http://127.0.0.1:20128",
        apiKey: "sk-dry",
        model: "test-model",
        yes: true,
        dryRun: true,
        importPath: rooImport,
        vscodeSettings: path.join(root, "missing-roo-vscode-settings.json"),
        allowContainerWrite: true,
      }),
      0
    );

    assert.equal(mode(clineSecret), 0o666);
    assert.equal(mode(kiloAuth), 0o666);
    assert.equal(mode(rooImport), 0o666);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("CLI setup sources repair existing secret files before reading or replacing them", () => {
  const cline = fs.readFileSync(
    path.join(import.meta.dirname, "../../../bin/cli/commands/setup-cline.mjs"),
    "utf8"
  );
  const kilo = fs.readFileSync(
    path.join(import.meta.dirname, "../../../bin/cli/commands/setup-kilo.mjs"),
    "utf8"
  );
  const roo = fs.readFileSync(
    path.join(import.meta.dirname, "../../../bin/cli/commands/setup-roo.mjs"),
    "utf8"
  );

  const clineRepair = cline.indexOf("repairOwnerOnlyFileSync(secPath)");
  const clineRead = cline.indexOf("existingSecrets = readJson(secPath)");
  assert.ok(clineRepair >= 0 && clineRead >= 0 && clineRepair < clineRead);

  const kiloAuthRepair = kilo.indexOf("repairOwnerOnlyFileSync(authPath)");
  const kiloAuthRead = kilo.indexOf("existingAuth = readJson(authPath)");
  assert.ok(kiloAuthRepair >= 0 && kiloAuthRead >= 0 && kiloAuthRepair < kiloAuthRead);
  const kiloVsRepair = kilo.indexOf("repairOwnerOnlyFileSync(vscodePath)");
  const kiloVsRead = kilo.indexOf("buildKiloVscodeSettings(readJson(vscodePath)");
  assert.ok(kiloVsRepair >= 0 && kiloVsRead >= 0 && kiloVsRepair < kiloVsRead);

  const rooRepair = roo.indexOf("repairOwnerOnlyFileSync(importPath)");
  const rooWrite = roo.indexOf("writeOwnerOnlyFileSync(importPath");
  assert.ok(rooRepair >= 0 && rooWrite >= 0 && rooRepair < rooWrite);
});
