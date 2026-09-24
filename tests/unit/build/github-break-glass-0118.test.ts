import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const policy = JSON.parse(
  fs.readFileSync("config/quality/github-governance-policy.json", "utf8")
) as {
  enforceAdmins?: boolean;
  requiredApprovingReviewCount?: number;
  dismissStaleReviews?: boolean;
  requireLastPushApproval?: boolean;
  strictRequiredChecks?: boolean;
  requiredChecks?: Array<{ context?: string; appId?: number }>;
  allowForcePushes?: boolean;
  allowDeletions?: boolean;
  breakGlass?: {
    enabled?: boolean;
    authorization?: string;
    temporaryMutation?: string[];
    requireProtectionSnapshot?: boolean;
    requireImmediateRestore?: boolean;
    requirePostRestoreGovernanceCheck?: boolean;
    requireAuditEvidence?: boolean;
    preserveRequiredChecks?: boolean;
    preserveReviewConfiguration?: boolean;
    forbidSelfApproval?: boolean;
  };
};

test("TC-GITHUB-BREAKGLASS-0118 preserves fail-closed steady state and bounds the owner exception", () => {
  assert.equal(policy.enforceAdmins, true);
  assert.equal(policy.requiredApprovingReviewCount, 0);
  assert.equal(policy.dismissStaleReviews, false);
  assert.equal(policy.requireLastPushApproval, false);
  assert.equal(policy.strictRequiredChecks, true);
  assert.deepEqual((policy.requiredChecks ?? []).map((check) => check.context).sort(), [
    "Quality Ratchet",
    "Security Tests",
  ]);
  assert.equal(policy.allowForcePushes, false);
  assert.equal(policy.allowDeletions, false);

  const breakGlass = policy.breakGlass;
  assert.ok(breakGlass, "explicit breakGlass contract is required");
  assert.equal(breakGlass.enabled, true);
  assert.equal(breakGlass.authorization, "repository-owner-explicit");
  assert.deepEqual(breakGlass.temporaryMutation, ["enforce_admins"]);
  assert.equal(breakGlass.requireProtectionSnapshot, true);
  assert.equal(breakGlass.requireImmediateRestore, true);
  assert.equal(breakGlass.requirePostRestoreGovernanceCheck, true);
  assert.equal(breakGlass.requireAuditEvidence, true);
  assert.equal(breakGlass.preserveRequiredChecks, true);
  assert.equal(breakGlass.preserveReviewConfiguration, true);
  assert.equal(breakGlass.forbidSelfApproval, true);
});
