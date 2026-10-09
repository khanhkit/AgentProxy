import assert from 'node:assert/strict';
import test from 'node:test';
import { interpretClaim } from '../../../scripts/ci/wait-runner-claim.mjs';

test('claim guard waits when context is absent or pending', () => {
  assert.equal(interpretClaim([], 'ctx'), 'wait');
  assert.equal(interpretClaim([{context:'ctx',state:'pending'}], 'ctx'), 'wait');
});
test('claim guard proceeds only on exact-context success', () => {
  assert.equal(interpretClaim([{context:'other',state:'success'},{context:'ctx',state:'success'}], 'ctx'), 'granted');
});
test('claim guard fails closed on failure or error', () => {
  assert.equal(interpretClaim([{context:'ctx',state:'failure'}], 'ctx'), 'denied');
  assert.equal(interpretClaim([{context:'ctx',state:'error'}], 'ctx'), 'denied');
});
