import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateGithubGovernance,
  normalizeRequiredChecks,
} from "../../../scripts/check/check-github-governance.mjs";

const policy = {
  branch: "main",
  enforceAdmins: true,
  strictRequiredChecks: true,
  requiredChecks: [
    { context: "Quality Ratchet", appId: 15368 },
    { context: "Security Tests", appId: 15368 },
  ],
  requiredApprovingReviewCount: 1,
  dismissStaleReviews: true,
  requireLastPushApproval: true,
  requireConversationResolution: true,
  requiredLinearHistory: true,
  allowForcePushes: false,
  allowDeletions: false,
};

function protectedState(overrides: Record<string, unknown> = {}) {
  return {
    enforce_admins: { enabled: true },
    required_status_checks: {
      strict: true,
      checks: [
        { context: "Quality Ratchet", app_id: 15368 },
        { context: "Security Tests", app_id: 15368 },
      ],
    },
    required_pull_request_reviews: {
      dismiss_stale_reviews: true,
      require_last_push_approval: true,
      required_approving_review_count: 1,
    },
    required_conversation_resolution: { enabled: true },
    required_linear_history: { enabled: true },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
    ...overrides,
  };
}

test("normalizeRequiredChecks: sorts context/app pairs deterministically", () => {
  assert.deepEqual(
    normalizeRequiredChecks([
      { context: "Security Tests", app_id: 15368 },
      { context: "Quality Ratchet", app_id: 15368 },
    ]),
    [
      { context: "Quality Ratchet", appId: 15368 },
      { context: "Security Tests", appId: 15368 },
    ]
  );
});

test("AP-0109 governance: exact fail-closed policy passes", () => {
  const verdict = evaluateGithubGovernance(protectedState(), policy);
  assert.deepEqual(verdict, { ok: true, failures: [] });
});

test("AP-0109 governance: admin bypass remains a failure", () => {
  const verdict = evaluateGithubGovernance(
    protectedState({ enforce_admins: { enabled: false } }),
    policy
  );
  assert.equal(verdict.ok, false);
  assert.ok(verdict.failures.includes("enforce_admins"));
});

test("AP-0109 governance: missing required checks fails", () => {
  const verdict = evaluateGithubGovernance(
    protectedState({ required_status_checks: null }),
    policy
  );
  assert.equal(verdict.ok, false);
  assert.ok(verdict.failures.includes("required_status_checks"));
});

test("AP-0109 governance: wrong app id cannot satisfy a required context", () => {
  const verdict = evaluateGithubGovernance(
    protectedState({
      required_status_checks: {
        strict: true,
        checks: [
          { context: "Quality Ratchet", app_id: -1 },
          { context: "Security Tests", app_id: 15368 },
        ],
      },
    }),
    policy
  );
  assert.equal(verdict.ok, false);
  assert.ok(verdict.failures.includes("required_checks"));
});

test("AP-0109 governance: weakening review protections fails", () => {
  const verdict = evaluateGithubGovernance(
    protectedState({
      required_pull_request_reviews: {
        dismiss_stale_reviews: false,
        require_last_push_approval: false,
        required_approving_review_count: 0,
      },
    }),
    policy
  );
  assert.equal(verdict.ok, false);
  assert.ok(verdict.failures.includes("required_pull_request_reviews"));
});
