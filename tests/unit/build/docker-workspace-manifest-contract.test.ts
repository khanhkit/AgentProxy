import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();

type DockerContract = {
  file: "Dockerfile" | "Dockerfile.bun";
  installPattern: RegExp;
};

const contracts: DockerContract[] = [
  { file: "Dockerfile", installPattern: /\bnpm ci\b/ },
  { file: "Dockerfile.bun", installPattern: /\bbun install\b/ },
];

function workspaceManifestPaths(): string[] {
  const rootPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
    workspaces?: string[] | { packages?: string[] };
  };
  const workspacePatterns = Array.isArray(rootPackage.workspaces)
    ? rootPackage.workspaces
    : (rootPackage.workspaces?.packages ?? []);

  const manifests = workspacePatterns.flatMap((workspacePattern) => {
    const manifestPattern = workspacePattern.replace(/\/$/, "") + "/package.json";
    return fs
      .globSync(manifestPattern, { cwd: repoRoot })
      .map((entry) => entry.replaceAll("\\", "/"));
  });

  return [...new Set(manifests)].sort();
}

function dependencyStageCopySources(dockerfile: string, installPattern: RegExp): string[] {
  const normalized = dockerfile.replace(/\\\r?\n\s*/g, " ");
  const lines = normalized.split(/\r?\n/);
  const installLineIndex = lines.findIndex(
    (line) => /^RUN\s+/i.test(line.trim()) && installPattern.test(line)
  );
  assert.notEqual(installLineIndex, -1, "Dockerfile must contain the dependency install command");

  return lines
    .slice(0, installLineIndex)
    .map((line) => line.trim())
    .filter((line) => /^COPY\s+/i.test(line) && !/^COPY\s+--from=/i.test(line))
    .flatMap((line) => {
      const tokens = line.split(/\s+/).slice(1);
      return tokens.slice(0, -1).filter((token) => !token.startsWith("--"));
    });
}

function copySourceCoversPath(source: string, manifestPath: string): boolean {
  const normalizedSource = source.replace(/^\.\//, "").replaceAll("\\", "/");
  const normalizedManifest = manifestPath.replace(/^\.\//, "").replaceAll("\\", "/");

  if (normalizedSource.endsWith("/")) {
    return normalizedManifest.startsWith(normalizedSource);
  }
  if (normalizedSource.includes("*")) {
    const escaped = normalizedSource.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", "[^/]*");
    return new RegExp(`^${escaped}$`).test(normalizedManifest);
  }
  return normalizedSource === normalizedManifest;
}

function dependencyFingerprint(copySources: string[], manifests: Map<string, string>): string {
  const hash = crypto.createHash("sha256");
  for (const manifestPath of [...manifests.keys()].sort()) {
    if (!copySources.some((source) => copySourceCoversPath(source, manifestPath))) continue;
    hash.update(manifestPath);
    hash.update("\0");
    hash.update(manifests.get(manifestPath) ?? "");
    hash.update("\0");
  }
  return hash.digest("hex");
}

const workspaceManifests = workspaceManifestPaths();

test("workspace inventory resolves every declared workspace package manifest", () => {
  assert.deepEqual(workspaceManifests, [
    "open-sse/package.json",
    "packages/browser-pool/package.json",
  ]);
});

for (const contract of contracts) {
  test(`${contract.file} dependency layer includes every workspace manifest before install`, () => {
    const dockerfile = fs.readFileSync(path.join(repoRoot, contract.file), "utf8");
    const copySources = dependencyStageCopySources(dockerfile, contract.installPattern);

    for (const manifestPath of workspaceManifests) {
      assert.ok(
        copySources.some((source) => copySourceCoversPath(source, manifestPath)),
        `${contract.file} must COPY ${manifestPath} before dependency installation`
      );
    }
  });

  test(`${contract.file} dependency fingerprint changes when any workspace manifest changes`, () => {
    const dockerfile = fs.readFileSync(path.join(repoRoot, contract.file), "utf8");
    const copySources = dependencyStageCopySources(dockerfile, contract.installPattern);
    const manifests = new Map(
      workspaceManifests.map((manifestPath) => [
        manifestPath,
        fs.readFileSync(path.join(repoRoot, manifestPath), "utf8"),
      ])
    );
    const baseline = dependencyFingerprint(copySources, manifests);

    for (const manifestPath of workspaceManifests) {
      const mutated = new Map(manifests);
      mutated.set(manifestPath, `${manifests.get(manifestPath)}\n// AP-ISS-0054 mutation fixture`);
      assert.notEqual(
        dependencyFingerprint(copySources, mutated),
        baseline,
        `${contract.file} dependency layer must invalidate when ${manifestPath} changes`
      );
    }
  });
}
