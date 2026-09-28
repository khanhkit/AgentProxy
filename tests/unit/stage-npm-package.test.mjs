import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildPublishStage,
  literalPositiveEntries,
} from "../../scripts/build/stage-npm-package.mjs";

function write(root, relative, content) {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function packFiles(root) {
  const output = execFileSync(
    "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts"],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const parsed = JSON.parse(output);
  const report = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
  assert.ok(report?.files, "npm pack dry-run did not return a file report");
  return report.files.map((entry) => entry.path).sort();
}

test("TC-PKG-STAGE-001 preserves npm file-set semantics while pruning node_modules", async () => {
  const temp = mkdtempSync(path.join(tmpdir(), "agentproxy-stage-test-"));
  const source = path.join(temp, "source");
  const stage = path.join(temp, "stage");

  try {
    mkdirSync(source, { recursive: true });
    const manifest = {
      name: "agentproxy-stage-fixture",
      version: "1.0.0",
      files: [
        "lib/",
        "bin/tool.mjs",
        "README.md",
        "LICENSE",
        "!**/node_modules/**",
        "!**/*.test.js",
      ],
      bin: { fixture: "bin/tool.mjs" },
    };

    write(source, "package.json", JSON.stringify(manifest, null, 2) + "\n");
    write(source, ".npmignore", "ignored-root.txt\n");
    write(source, ".gitignore", "ignored-by-git.txt\n");
    write(source, "README.md", "# fixture\n");
    write(source, "LICENSE", "fixture license\n");
    write(source, "lib/index.js", "export const value = 1;\n");
    write(source, "lib/index.test.js", "throw new Error('must not publish');\n");
    write(source, "lib/node_modules/heavy/index.js", "export default 'excluded';\n");
    write(source, "bin/tool.mjs", "#!/usr/bin/env node\nconsole.log('fixture');\n");
    write(source, "ignored-root.txt", "not published\n");
    write(source, "ignored-by-git.txt", "not published\n");

    const sourceFiles = packFiles(source);
    const result = await buildPublishStage({ sourceDir: source, stageDir: stage });
    const stageFiles = packFiles(stage);

    assert.deepEqual(stageFiles, sourceFiles);
    assert.equal(result.prunedNodeModules >= 1, true);
    assert.equal(
      readFileSync(path.join(stage, "package.json"), "utf8"),
      readFileSync(path.join(source, "package.json"), "utf8"),
    );
    assert.equal(
      readFileSync(path.join(stage, ".npmignore"), "utf8"),
      readFileSync(path.join(source, ".npmignore"), "utf8"),
    );
    assert.equal(
      readFileSync(path.join(stage, ".gitignore"), "utf8"),
      readFileSync(path.join(source, ".gitignore"), "utf8"),
    );
    assert.equal(
      sourceFiles.some((entry) => entry.includes("node_modules")),
      false,
    );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("TC-PKG-STAGE-002 rejects unsafe or ambiguous positive package files entries", () => {
  assert.throws(() => literalPositiveEntries({ files: ["../escape"] }), /unsafe/i);
  assert.throws(() => literalPositiveEntries({ files: ["/absolute"] }), /unsafe/i);
  assert.throws(() => literalPositiveEntries({ files: ["lib/*.js"] }), /literal/i);
});

test("TC-PKG-STAGE-003 retains only positive roots plus npm authority metadata", async () => {
  const temp = mkdtempSync(path.join(tmpdir(), "agentproxy-stage-meta-"));
  const source = path.join(temp, "source");
  const stage = path.join(temp, "stage");

  try {
    mkdirSync(source, { recursive: true });
    write(
      source,
      "package.json",
      JSON.stringify({
        name: "fixture-meta",
        version: "1.0.0",
        files: ["src/", "!**/*.test.js"],
      }) + "\n",
    );
    write(source, ".npmignore", "private.txt\n");
    write(source, ".gitignore", "git-private.txt\n");
    write(source, "src/index.js", "export {};\n");
    write(source, "outside.txt", "must not enter staging\n");

    await buildPublishStage({ sourceDir: source, stageDir: stage });

    assert.equal(readFileSync(path.join(stage, "src/index.js"), "utf8"), "export {};\n");
    assert.throws(() => readFileSync(path.join(stage, "outside.txt"), "utf8"));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
