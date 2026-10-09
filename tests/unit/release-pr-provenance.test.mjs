import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateMergedPrProvenance } from '../../scripts/release/verify-pr-branch-provenance.mjs';

const branch = 'kit/ap-iss-0136-provenance-backfill';
const head = 'a'.repeat(40);
const accepted = 'b'.repeat(40);

function mergedPr(overrides = {}) {
  return {
    state: 'MERGED',
    headRefName: branch,
    headRefOid: head,
    mergeCommit: { oid: accepted },
    ...overrides,
  };
}

test('merged PR provenance accepts exact branch/head and accepted main ancestry', () => {
  assert.deepEqual(
    evaluateMergedPrProvenance({ pr: mergedPr(), branch, branchSha: head, acceptedMainContainsMerge: true }),
    { ok: true, failures: [], acceptedMainSha: accepted },
  );
});

test('merged PR provenance rejects a head mismatch before branch deletion', () => {
  const result = evaluateMergedPrProvenance({ pr: mergedPr(), branch, branchSha: 'c'.repeat(40), acceptedMainContainsMerge: true });
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('head_sha'));
});

test('merged PR provenance rejects unmerged or non-main integration records', () => {
  const unmerged = evaluateMergedPrProvenance({ pr: mergedPr({ state: 'OPEN', mergeCommit: null }), branch, branchSha: head, acceptedMainContainsMerge: false });
  assert.equal(unmerged.ok, false);
  assert.ok(unmerged.failures.includes('merged_state'));
  assert.ok(unmerged.failures.includes('accepted_main_ancestry'));
});
