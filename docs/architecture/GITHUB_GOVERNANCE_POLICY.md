# GitHub Main-Branch Governance Policy

## Authority

The `main` branch uses GitHub branch protection as the authoritative merge-governance control.

Repository rulesets are currently not configured. Any future migration from branch protection to rulesets must preserve or strengthen every invariant below before the old control is removed.

## Fail-Closed Invariants

The protected branch must enforce:

- administrators are subject to branch protection;
- at least one approving pull-request review;
- stale approvals are dismissed;
- the latest push must be approved;
- review conversations must be resolved;
- linear history is required;
- force pushes and branch deletion are disabled;
- required checks are strict, so the branch must be up to date before merge.

## Required Checks

The currently deployed required contexts are:

| Context           | GitHub App                     |
| ----------------- | ------------------------------ |
| `Quality Ratchet` | GitHub Actions, app id `15368` |
| `Security Tests`  | GitHub Actions, app id `15368` |

The app binding is intentional: another GitHub App emitting the same context name must not satisfy protection.

These checks were selected because they already exist on deployed `main` PR workflows and have demonstrated both green and red verdicts.

### Deliberately Not Required Yet

`CI Dashboard` is not a merge gate because it can report success while underlying blocking jobs are red.

The AP-ISS-0107 automatic PR CodeQL context is not required until that automatic workflow is actually deployed on the default branch and observed on real PRs. Requiring a not-yet-emitted context would deadlock the repository.

Likewise, `Fast Quality Gates` is not required until it is consistently emitted on PRs targeting `main`.

## Break-Glass Process

There is no routine administrator bypass. `enforce_admins=true` is the normal state.

For this single-maintainer repository, the repository owner may explicitly authorize an audited break-glass integration when the configured review topology cannot be satisfied. The steady-state policy is not weakened: required checks, review settings, conversation resolution, linear history, force-push protection, and deletion protection remain configured exactly as normal.

The permitted exception is intentionally narrow:

1. record explicit repository-owner authorization, the PR number, exact head SHA, reason, and expected merge operation;
2. capture the complete current branch-protection JSON before mutation;
3. temporarily suspend **only** administrator enforcement; do not delete or weaken required status checks or review configuration;
4. do not self-approve the pull request;
5. perform the explicitly authorized admin merge;
6. immediately restore administrator enforcement, even if the merge command fails;
7. re-run `node scripts/check/check-github-governance.mjs --json` and require `ok: true`;
8. retain the before/after protection evidence, merge SHA, and restoration result.

This procedure is a documented owner-authorized exception for an otherwise-unsatisfiable sole-maintainer review topology. It is not a routine merge path and must not be used to hide an issue-local failing check. The default branch-protection policy remains fail-closed outside the bounded break-glass window.

## Verification

The committed contract is:

- `config/quality/github-governance-policy.json`
- `scripts/check/check-github-governance.mjs`

Run:

`node scripts/check/check-github-governance.mjs --json`

A compliant live repository returns `ok: true` with an empty failure list.
