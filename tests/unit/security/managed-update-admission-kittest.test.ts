import test, { after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-kittest-supply-"));
const originalFetch = globalThis.fetch;
const originalPath = process.env.PATH;

const binaryManagerPromise = import("../../../src/lib/versionManager/binaryManager.ts");
const releaseCheckerPromise = import("../../../src/lib/versionManager/releaseChecker.ts");
const managedUpdatePolicyPromise =
  import("../../../src/lib/services/installers/managedUpdatePolicy.ts");

function resetCaseDir(name: string): string {
  const dir = path.join(tmpRoot, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sha256(body: string): string {
  return crypto.createHash("sha256").update(body).digest("hex");
}

function installFakePowerShell(caseDir: string, version: string): { logPath: string } {
  const fakeBinDir = path.join(caseDir, "fake-bin");
  const logPath = path.join(caseDir, "extract.log");
  const extractedDir = path.join(caseDir, "bin", `cliproxyapi-${version}`);
  fs.mkdirSync(fakeBinDir, { recursive: true });
  fs.writeFileSync(
    path.join(fakeBinDir, "powershell"),
    "#!/bin/sh\n" +
      'printf "%s\\n" "$@" > "$KITTEST_EXTRACT_LOG"\n' +
      'mkdir -p "$KITTEST_EXTRACT_DIR"\n' +
      'printf "kittest-installed-binary" > "$KITTEST_EXTRACT_DIR/cli-proxy-api"\n'
  );
  fs.chmodSync(path.join(fakeBinDir, "powershell"), 0o755);
  process.env.PATH = `${fakeBinDir}:${originalPath || ""}`;
  process.env.KITTEST_EXTRACT_LOG = logPath;
  process.env.KITTEST_EXTRACT_DIR = extractedDir;
  return { logPath };
}

function mockReleaseFetch(options: {
  version: string;
  artifactBody?: string;
  checksum: "missing" | "mismatch" | "valid";
}): { assetName: string; requests: string[] } {
  const artifactBody = options.artifactBody ?? `artifact-${options.version}`;
  const assetName = `CLIProxyAPI_${options.version}_windows_amd64.zip`;
  const requests: string[] = [];

  globalThis.fetch = async (input: string | URL | Request) => {
    const url = String(input);
    requests.push(url);

    if (url.includes("/releases/tags/")) {
      return new Response(
        JSON.stringify({
          tag_name: `v${options.version}`,
          published_at: "2026-09-16T00:00:00Z",
          body: "kittest synthetic release",
          assets: [
            {
              name: assetName,
              browser_download_url: `https://example.test/${assetName}`,
              size: artifactBody.length,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (url.endsWith("checksums.txt")) {
      if (options.checksum === "missing") return new Response("", { status: 404 });
      const digest = options.checksum === "valid" ? sha256(artifactBody) : "0".repeat(64);
      return new Response(`${digest}  ${assetName}\n`, { status: 200 });
    }

    if (url === `https://example.test/${assetName}`) {
      return new Response(artifactBody, { status: 200 });
    }

    throw new Error(`Unexpected KitTest fetch: ${url}`);
  };

  return { assetName, requests };
}

beforeEach(async () => {
  globalThis.fetch = originalFetch;
  process.env.PATH = originalPath;
  delete process.env.KITTEST_EXTRACT_LOG;
  delete process.env.KITTEST_EXTRACT_DIR;
  const releaseChecker = await releaseCheckerPromise;
  releaseChecker.clearCache();
});

after(() => {
  globalThis.fetch = originalFetch;
  process.env.PATH = originalPath;
  delete process.env.KITTEST_EXTRACT_LOG;
  delete process.env.KITTEST_EXTRACT_DIR;
  fs.rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

test("TC-SUPPLY-SEC-001 mutable release references are not promotion/install identities", () => {
  const cliUpdater = fs.readFileSync(path.join(repoRoot, "bin/cli/commands/update.mjs"), "utf8");
  const nineRouter = fs.readFileSync(
    path.join(repoRoot, "src/lib/services/installers/ninerouter.ts"),
    "utf8"
  );
  const cliProxy = fs.readFileSync(
    path.join(repoRoot, "src/lib/services/installers/cliproxy.ts"),
    "utf8"
  );

  const mutablePromotionPaths = [
    /npm install -g agentproxy@latest\b/.test(cliUpdater) ? "cli:agentproxy@latest" : null,
    /return\s+install\(["']latest["']\)/.test(nineRouter) ? "ninerouter:update->latest" : null,
    /return\s+install\(["']latest["']\)/.test(cliProxy) ? "cliproxy:update->latest" : null,
  ].filter(Boolean);

  assert.deepEqual(
    mutablePromotionPaths,
    [],
    `TC-SUPPLY-SEC-001: managed update promotion still consumes mutable identities: ${mutablePromotionPaths.join(", ")}`
  );
});

test("TC-SUPPLY-SEC-002 missing verification metadata fails closed before extraction/install", async () => {
  const version = "91.0.2-kittest";
  const caseDir = resetCaseDir("missing-checksum");
  const { logPath } = installFakePowerShell(caseDir, version);
  const { requests } = mockReleaseFetch({ version, checksum: "missing" });
  const binaryManager = await binaryManagerPromise;

  let accepted = false;
  let errorMessage = "";
  try {
    await binaryManager.downloadRelease(version, path.join(caseDir, "bin"), undefined, {
      platform: "windows",
      arch: "amd64",
    });
    accepted = true;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  assert.equal(
    requests.some((url) => url.endsWith("checksums.txt")),
    true,
    "TC-SUPPLY-SEC-002: checksum metadata must be requested"
  );
  if (!accepted) {
    assert.match(errorMessage, /checksum|digest|verification|integrity/i);
  }
  assert.deepEqual(
    { accepted, extractionRan: fs.existsSync(logPath) },
    { accepted: false, extractionRan: false },
    "TC-SUPPLY-SEC-002: missing verification metadata must reject before extraction/install"
  );
});

test("TC-SUPPLY-SEC-003 mismatched digest fails closed before extraction/install", async () => {
  const version = "91.0.3-kittest";
  const caseDir = resetCaseDir("digest-mismatch");
  const { logPath } = installFakePowerShell(caseDir, version);
  const { requests } = mockReleaseFetch({ version, checksum: "mismatch" });
  const binaryManager = await binaryManagerPromise;

  await assert.rejects(
    binaryManager.downloadRelease(version, path.join(caseDir, "bin"), undefined, {
      platform: "windows",
      arch: "amd64",
    }),
    /SHA256 checksum mismatch/
  );
  assert.equal(fs.existsSync(logPath), false, "digest mismatch must be rejected before extraction");
  assert.equal(
    requests.some((url) => url.endsWith("checksums.txt")),
    true
  );
});

test("TC-SUPPLY-SEC-004 known-bad compatibility policy rejects candidate before promotion", async () => {
  const { assertManagedUpdateCompatibility, resolveVerifiedNpmArtifact } =
    await managedUpdatePolicyPromise;
  const calls: string[][] = [];
  const runner = async (args: string[]) => {
    calls.push(args);
    if (calls.length === 1) return { stdout: '"2.3.4"\n', stderr: "" };
    return { stdout: '"sha512-YWJjZA=="\n', stderr: "" };
  };

  const artifact = await resolveVerifiedNpmArtifact("9router", "latest", runner);
  assert.deepEqual(artifact, {
    version: "2.3.4",
    integrity: "sha512-YWJjZA==",
  });

  let promotionCalls = 0;
  assert.throws(() => {
    assertManagedUpdateCompatibility("9router", artifact.version, {
      pinnedVersion: null,
      configOverrides: {
        managedUpdate: {
          blockedVersions: [artifact.version],
        },
      },
    });
    promotionCalls += 1;
  }, /blocked by managed update compatibility policy/i);

  assert.equal(
    promotionCalls,
    0,
    "TC-SUPPLY-SEC-004: compatibility-denied artifact must not reach promotion"
  );
  assert.deepEqual(calls, [
    ["view", "9router@latest", "version", "--json"],
    ["view", "9router@2.3.4", "dist.integrity", "--json"],
  ]);
});

test("TC-SUPPLY-REG-005 exact verified artifact installs and prior version remains rollback target", async () => {
  const version = "91.0.5";
  const previous = "90.9.9";
  const caseDir = resetCaseDir("verified-rollback");
  const { logPath } = installFakePowerShell(caseDir, version);
  const { requests } = mockReleaseFetch({ version, checksum: "valid" });
  const binaryManager = await binaryManagerPromise;

  const binDir = path.join(caseDir, "bin");
  const previousDir = path.join(binDir, `cliproxyapi-${previous}`);
  fs.mkdirSync(previousDir, { recursive: true });
  fs.writeFileSync(path.join(previousDir, "cli-proxy-api"), "kittest-previous-binary");

  const platformMock = mock.method(os, "platform", () => "win32");
  const archMock = mock.method(os, "arch", () => "x64");
  try {
    const installedPath = await binaryManager.installVersion(version, caseDir);
    assert.equal(fs.existsSync(logPath), true, "verified artifact should reach extraction/install");
    assert.equal(fs.readFileSync(installedPath, "utf8"), "kittest-installed-binary");
    assert.equal(
      requests.some((url) => url.endsWith("checksums.txt")),
      true
    );

    const rollbackTarget = await binaryManager.rollbackVersion(caseDir);
    assert.equal(rollbackTarget, previous);
    assert.equal(fs.readFileSync(installedPath, "utf8"), "kittest-previous-binary");
  } finally {
    platformMock.mock.restore();
    archMock.mock.restore();
  }
});
