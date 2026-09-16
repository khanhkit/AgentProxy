import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ORIGINAL_DATA_DIR = process.env.DATA_DIR;
const { generateCert } = await import("../../src/mitm/cert/generate.ts");

function mode(filePath: string): number {
  return fs.statSync(filePath).mode & 0o777;
}

function restoreDataDir() {
  if (ORIGINAL_DATA_DIR === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = ORIGINAL_DATA_DIR;
}

test.after(restoreDataDir);

test("MITM leaf private key is created owner-only under permissive umask", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-mitm-leaf-mode-"));
  const oldUmask = process.umask(0);
  process.env.DATA_DIR = root;
  try {
    await generateCert({ force: true });
    const certDir = path.join(root, "mitm");
    assert.equal(mode(path.join(certDir, "server.key")), 0o600);
    assert.equal(mode(certDir) & 0o022, 0, "MITM cert directory must not be shared-writable");
  } finally {
    process.umask(oldUmask);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("MITM cached leaf key is repaired before an existing certificate is reused", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-mitm-leaf-repair-"));
  process.env.DATA_DIR = root;
  try {
    const certDir = path.join(root, "mitm");
    fs.mkdirSync(certDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(certDir, "server.key"), "legacy-key", { mode: 0o666 });
    fs.writeFileSync(path.join(certDir, "server.crt"), "legacy-cert", { mode: 0o644 });
    fs.chmodSync(path.join(certDir, "server.key"), 0o666);

    await generateCert();
    assert.equal(mode(path.join(certDir, "server.key")), 0o600);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
