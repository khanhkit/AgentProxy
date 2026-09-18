import assert from "node:assert/strict";
import { createWriteStream } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, stat } from "node:fs/promises";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { extractPluginZip } from "@openai/codex-security";
import yazl from "yazl";

test("TC-SUPPLYCHAIN-REG-0110-001 pins patched adm-zip resolution", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const packageLock = JSON.parse(await readFile("package-lock.json", "utf8"));

  assert.equal(packageJson.overrides?.["adm-zip"], "0.6.1");
  assert.equal(packageLock.packages?.["node_modules/adm-zip"]?.version, "0.6.1");
});

test("TC-SUPPLYCHAIN-SEC-0110-002 rejects symlink archive escape before outside write", async () => {
  const root = await mkdtemp(join(tmpdir(), "ap-iss-0110-"));
  const archivePath = join(root, "malicious.zip");
  const destination = join(root, "plugin");
  const outside = join(root, "outside");
  const escapedFile = join(outside, "pwned.txt");

  try {
    await mkdir(outside);

    const archive = new yazl.ZipFile();
    archive.addBuffer(Buffer.from("../outside"), "link", { mode: 0o120777 });
    archive.addBuffer(Buffer.from("owned"), "link/pwned.txt", { mode: 0o100644 });

    const output = createWriteStream(archivePath);
    archive.outputStream.pipe(output);
    archive.end();
    await once(output, "finish");

    await assert.rejects(
      extractPluginZip(archivePath, destination),
      /Plugin ZIP contains an unsafe path: link/
    );

    await assert.rejects(stat(escapedFile), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
