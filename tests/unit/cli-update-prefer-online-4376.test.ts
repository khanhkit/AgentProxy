import test from "node:test";
import assert from "node:assert/strict";

const update = await import("../../bin/cli/commands/update.mjs");

// #4376: `omniroute update` reported "Latest version: 3.8.30" while npm's `latest`
// dist-tag was already 3.8.31, so it told users on an old build they were "running
// the latest version". Root cause: getLatestVersion() ran `npm view omniroute version`
// without `--prefer-online`, so npm served a stale value from its HTTP cache.
// The fix forces npm to revalidate the cache against the registry.
test("getLatestVersion passes --prefer-online to bypass the stale npm cache (#4376)", async () => {
  let capturedArgs = null;
  const fakeExec = async (cmd: string, args: string[]) => {
    capturedArgs = { cmd, args };
    return { stdout: "3.8.31\n" };
  };
  const latest = await update.getLatestVersion(fakeExec);
  assert.equal(latest, "3.8.31");
  assert.ok(capturedArgs, "exec must be invoked");
  assert.equal(capturedArgs.cmd, "npm");
  assert.ok(
    capturedArgs.args.includes("--prefer-online"),
    `expected --prefer-online in npm args, got: ${JSON.stringify(capturedArgs.args)}`
  );
  // still the right query
  assert.ok(capturedArgs.args.includes("view"));
  assert.ok(capturedArgs.args.includes("omniroute"));
  assert.ok(capturedArgs.args.includes("version"));
});

test("getLatestVersion returns null when npm is unavailable (#4376)", async () => {
  const latest = await update.getLatestVersion(async () => {
    throw new Error("npm not found");
  });
  assert.equal(latest, null);
});

test("getLatestArtifact resolves version and SRI in one literal npm query", async () => {
  let capturedArgs: string[] | null = null;
  const artifact = await update.getLatestArtifact(async (_cmd: string, args: string[]) => {
    capturedArgs = args;
    return {
      stdout: '[{"version":"3.8.51","dist.integrity":"sha512-YWJjZA=="}]\n',
    };
  });

  assert.deepEqual(artifact, { version: "3.8.51", integrity: "sha512-YWJjZA==" });
  assert.deepEqual(capturedArgs, [
    "view",
    "omniroute",
    "version",
    "dist.integrity",
    "--json",
    "--prefer-online",
  ]);
});

test("getLatestArtifact fails closed when integrity metadata is missing", async () => {
  const artifact = await update.getLatestArtifact(async () => ({
    stdout: '[{"version":"3.8.51"}]\n',
  }));
  assert.equal(artifact, null);
});
