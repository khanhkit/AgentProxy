#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const SHA40 = /^[0-9a-f]{40}$/u;

export function evaluateMergedPrProvenance({
  pr,
  branch,
  branchSha,
  acceptedMainContainsMerge,
}) {
  const failures = [];
  if (pr?.state !== 'MERGED') failures.push('merged_state');
  if (pr?.headRefName !== branch) failures.push('head_branch');
  if (!SHA40.test(String(branchSha ?? '')) || pr?.headRefOid !== branchSha) {
    failures.push('head_sha');
  }
  const acceptedMainSha = String(pr?.mergeCommit?.oid ?? '');
  if (!SHA40.test(acceptedMainSha)) failures.push('merge_sha');
  if (!acceptedMainContainsMerge) failures.push('accepted_main_ancestry');
  return { ok: failures.length === 0, failures, acceptedMainSha };
}

function argValue(name, fallback = undefined) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function detectRepo() {
  return execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], {
    encoding: 'utf8',
    timeout: 15_000,
  }).trim();
}

function readRemoteBranchSha(remote, branch) {
  const output = execFileSync('git', ['ls-remote', '--heads', remote, `refs/heads/${branch}`], {
    encoding: 'utf8',
    timeout: 30_000,
  }).trim();
  if (!output) return '';
  const [sha, ref, ...rest] = output.split(/\s+/u);
  if (rest.length || ref !== `refs/heads/${branch}` || !SHA40.test(sha)) {
    throw new Error(`unexpected ls-remote output for ${branch}: ${output}`);
  }
  return sha;
}

function readPr(repo, number) {
  return JSON.parse(
    execFileSync(
      'gh',
      ['pr', 'view', String(number), '--repo', repo, '--json', 'state,headRefName,headRefOid,mergeCommit'],
      { encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024 },
    ),
  );
}

function main() {
  const prNumber = Number.parseInt(argValue('--pr', ''), 10);
  const branch = argValue('--branch', '');
  const remote = argValue('--remote', 'origin');
  const mainBranch = argValue('--main', 'main');
  if (!Number.isInteger(prNumber) || prNumber <= 0 || !branch) {
    console.error('usage: verify-pr-branch-provenance.mjs --pr <number> --branch <name> [--remote origin] [--main main] [--json]');
    process.exitCode = 2;
    return;
  }

  const repo = detectRepo();
  const branchSha = readRemoteBranchSha(remote, branch);
  if (!branchSha) {
    const result = { ok: false, failures: ['source_branch_missing'], acceptedMainSha: '' };
    process.stdout.write(JSON.stringify({ repo, pr: prNumber, branch, branchSha, ...result }, null, 2) + '\n');
    process.exitCode = 1;
    return;
  }

  const pr = readPr(repo, prNumber);
  execFileSync('git', ['fetch', '--quiet', remote, mainBranch], { timeout: 60_000 });
  const mergeSha = String(pr?.mergeCommit?.oid ?? '');
  const ancestry = SHA40.test(mergeSha)
    ? spawnSync('git', ['merge-base', '--is-ancestor', mergeSha, `${remote}/${mainBranch}`]).status === 0
    : false;
  const result = evaluateMergedPrProvenance({
    pr,
    branch,
    branchSha,
    acceptedMainContainsMerge: ancestry,
  });
  const payload = { repo, pr: prNumber, branch, branchSha, ...result };
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  } else if (result.ok) {
    console.log(`branchProvenance=PASS pr=${prNumber} branch=${branch} head=${branchSha} acceptedMain=${result.acceptedMainSha}`);
  } else {
    console.log(`branchProvenance=FAIL pr=${prNumber} branch=${branch} failures=${result.failures.join(',')}`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main();
}
