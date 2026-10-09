import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  validateExactSpec,
  validateRegistryMetadata,
  verifySha512,
} from '../../scripts/ops/install-verified-npm-package.mjs';

test('verified installer accepts only exact AgentProxy versions', () => {
  assert.equal(validateExactSpec('agentproxy@1.2.3'), 'agentproxy@1.2.3');
  for (const bad of ['agentproxy@latest', 'agentproxy@^1.2.3', 'other@1.2.3', 'agentproxy@1.2']) {
    assert.throws(() => validateExactSpec(bad), /non-exact/);
  }
});

test('registry metadata requires trusted HTTPS registry and sha512 integrity', () => {
  const digest = createHash('sha512').update('archive').digest('base64');
  const good = validateRegistryMetadata({
    'dist.tarball': 'https://registry.npmjs.org/agentproxy/-/agentproxy-1.2.3.tgz',
    'dist.integrity': `sha512-${digest}`,
  });
  assert.equal(good.expected.length, 64);
  assert.throws(() => validateRegistryMetadata({
    'dist.tarball': 'https://evil.example/agentproxy.tgz',
    'dist.integrity': `sha512-${digest}`,
  }), /untrusted/);
  assert.throws(() => validateRegistryMetadata({
    'dist.tarball': 'https://registry.npmjs.org/agentproxy/-/agentproxy-1.2.3.tgz',
    'dist.integrity': 'sha256-deadbeef',
  }), /unsupported/);
});

test('sha512 verification fails closed on modified bytes', () => {
  const expected = createHash('sha512').update('archive').digest();
  assert.equal(verifySha512(Buffer.from('archive'), expected), true);
  assert.equal(verifySha512(Buffer.from('tampered'), expected), false);
});
