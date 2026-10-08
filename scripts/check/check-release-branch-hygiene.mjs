#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_REMOTE = "origin";
const REQUIRED_BRANCH = "main";
const DEFAULT_PROVENANCE = path.join(process.cwd(), "config/quality/release-branch-provenance.json");

export function evaluateProvenanceManifest(manifest) {
  const failures = [];
  if (!manifest || !Array.isArray(manifest.entries)) {
    return { ok: false, failures: ["manifest_entries"] };
  }
  for (const [index, entry] of manifest.entries.entries()) {
    const prefix = `entries[${index}]`;
    if (!entry?.sourceBranch) failures.push(`${prefix}.sourceBranch`);
    if (!/^[0-9a-f]{40}$/u.test(String(entry?.sourceHeadSha ?? ""))) failures.push(`${prefix}.sourceHeadSha`);
    if (!["integrated", "closed-unintegrated"].includes(entry?.disposition)) failures.push(`${prefix}.disposition`);
    if (entry?.disposition === "integrated") {
      if (!entry?.pullRequest) failures.push(`${prefix}.pullRequest`);
      if (!/^[0-9a-f]{40}$/u.test(String(entry?.acceptedMainSha ?? ""))) failures.push(`${prefix}.acceptedMainSha`);
    }
  }
  return { ok: failures.length === 0, failures };
}

export function readProvenanceManifest(file = DEFAULT_PROVENANCE) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}


export function parseGitRemoteHeads(output) {
  const branches = [];
  for (const rawLine of String(output ?? "").split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = /^([0-9a-fA-F]+)\s+refs\/heads\/(.+)$/u.exec(line);
    if (!match) {
      throw new Error(`unexpected git ls-remote output: ${line}`);
    }
    branches.push(match[2]);
  }
  return [...new Set(branches)].sort();
}

export function parseGhBranchNames(output) {
  return [
    ...new Set(
      String(output ?? "")
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean)
    ),
  ].sort();
}

export function evaluateMainOnlyBranches(branches) {
  const normalized = [...new Set(branches)].sort();
  const unexpected = normalized.filter((branch) => branch !== REQUIRED_BRANCH);
  const hasMain = normalized.includes(REQUIRED_BRANCH);
  return {
    ok: hasMain && normalized.length === 1,
    branches: normalized,
    hasMain,
    unexpected,
  };
}

function listBranchesWithGit(remote) {
  const output = execFileSync("git", ["ls-remote", "--heads", remote], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  return parseGitRemoteHeads(output);
}

function listBranchesWithGitHubApi(repository, token) {
  const output = execFileSync(
    "gh",
    [
      "api",
      "--paginate",
      `repos/${repository}/branches?per_page=100`,
      "--jq",
      ".[].name",
    ],
    {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, GH_TOKEN: token },
    }
  );
  return parseGhBranchNames(output);
}

export function listReleaseBranches({
  remote = DEFAULT_REMOTE,
  repository = process.env.GITHUB_REPOSITORY,
  token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN,
} = {}) {
  if (repository && token) {
    return listBranchesWithGitHubApi(repository, token);
  }
  return listBranchesWithGit(remote);
}

export function checkReleaseBranchHygiene(options = {}) {
  try {
    const branches = listReleaseBranches(options);
    const branchVerdict = evaluateMainOnlyBranches(branches);
    const provenanceVerdict = evaluateProvenanceManifest(
      readProvenanceManifest(options.provenanceFile)
    );
    return {
      ...branchVerdict,
      provenanceOk: provenanceVerdict.ok,
      provenanceFailures: provenanceVerdict.failures,
      ok: branchVerdict.ok && provenanceVerdict.ok,
    };
  } catch (error) {
    return {
      ok: false,
      branches: [],
      hasMain: false,
      unexpected: [],
      provenanceOk: false,
      provenanceFailures: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function main() {
  const result = checkReleaseBranchHygiene();
  if (result.ok) {
    console.log("✅ Release branch hygiene: remote contains exactly one branch: main");
    return;
  }

  console.error("❌ Release blocked: GitHub branch hygiene invariant failed.");
  console.error("   Required remote branch set: [main]");
  if (result.error) {
    console.error(`   Could not enumerate remote branches: ${result.error}`);
  } else {
    console.error(
      `   Observed remote branches: [${result.branches.length ? result.branches.join(", ") : "<none>"}]`
    );
    if (!result.provenanceOk) {
      console.error(`   Invalid release provenance: ${result.provenanceFailures.join(", ")}`);
    }
    if (!result.hasMain) {
      console.error("   Missing required branch: main");
    }
    for (const branch of result.unexpected) {
      console.error(`   Delete before release: ${branch}`);
    }
  }
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
