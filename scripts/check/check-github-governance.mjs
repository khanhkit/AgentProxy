#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const DEFAULT_POLICY = path.join(ROOT, "config/quality/github-governance-policy.json");

export function normalizeRequiredChecks(checks) {
  if (!Array.isArray(checks)) return [];
  return checks
    .map((check) => ({
      context: String(check?.context ?? ""),
      appId: Number(check?.app_id ?? check?.appId ?? -1),
    }))
    .filter((check) => check.context.length > 0)
    .sort((left, right) =>
      left.context === right.context
        ? left.appId - right.appId
        : left.context.localeCompare(right.context)
    );
}

export function evaluateGithubGovernance(protection, policy) {
  const failures = [];

  if (protection?.enforce_admins?.enabled !== policy.enforceAdmins) {
    failures.push("enforce_admins");
  }

  const statusChecks = protection?.required_status_checks;
  if (!statusChecks) {
    failures.push("required_status_checks");
  } else {
    if (Boolean(statusChecks.strict) !== policy.strictRequiredChecks) {
      failures.push("strict_required_checks");
    }

    const actualChecks = normalizeRequiredChecks(
      statusChecks.checks ?? statusChecks.contexts ?? []
    );
    const expectedChecks = normalizeRequiredChecks(policy.requiredChecks);
    if (JSON.stringify(actualChecks) !== JSON.stringify(expectedChecks)) {
      failures.push("required_checks");
    }
  }

  const reviews = protection?.required_pull_request_reviews;
  if (
    !reviews ||
    reviews.required_approving_review_count < policy.requiredApprovingReviewCount ||
    reviews.dismiss_stale_reviews !== policy.dismissStaleReviews ||
    reviews.require_last_push_approval !== policy.requireLastPushApproval
  ) {
    failures.push("required_pull_request_reviews");
  }

  if (
    protection?.required_conversation_resolution?.enabled !== policy.requireConversationResolution
  ) {
    failures.push("required_conversation_resolution");
  }

  if (protection?.required_linear_history?.enabled !== policy.requiredLinearHistory) {
    failures.push("required_linear_history");
  }

  if (protection?.allow_force_pushes?.enabled !== policy.allowForcePushes) {
    failures.push("allow_force_pushes");
  }

  if (protection?.allow_deletions?.enabled !== policy.allowDeletions) {
    failures.push("allow_deletions");
  }

  return { ok: failures.length === 0, failures };
}

function readPolicy(policyPath) {
  return JSON.parse(fs.readFileSync(policyPath, "utf8"));
}

function detectRepo() {
  return execFileSync("gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"], {
    encoding: "utf8",
    timeout: 15_000,
  }).trim();
}

function readProtection(repo, branch) {
  const stdout = execFileSync("gh", ["api", `repos/${repo}/branches/${branch}/protection`], {
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

function main() {
  const policyArg = process.argv.indexOf("--policy");
  const policyPath =
    policyArg >= 0 && process.argv[policyArg + 1]
      ? path.resolve(process.argv[policyArg + 1])
      : DEFAULT_POLICY;

  const policy = readPolicy(policyPath);
  const repo = detectRepo();
  const protection = readProtection(repo, policy.branch);
  const verdict = evaluateGithubGovernance(protection, policy);

  if (process.argv.includes("--json")) {
    process.stdout.write(
      JSON.stringify({ repo, branch: policy.branch, ...verdict }, null, 2) + "\n"
    );
  } else if (verdict.ok) {
    console.log(`githubGovernance=PASS repo=${repo} branch=${policy.branch}`);
  } else {
    console.log(
      `githubGovernance=FAIL repo=${repo} branch=${policy.branch} failures=${verdict.failures.join(",")}`
    );
  }

  process.exitCode = verdict.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main();
}
