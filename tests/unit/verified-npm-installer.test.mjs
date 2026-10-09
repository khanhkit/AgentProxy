import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as installer from '../../scripts/ops/install-verified-npm-package.mjs';
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
    'dist.tarball': 'https://registry.npmjs.org:444/agentproxy/-/agentproxy-1.2.3.tgz',
    'dist.integrity': `sha512-${digest}`,
  }), /untrusted/);
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


test('verified archive download is bounded before and while buffering', async () => {
  assert.equal(typeof installer.readBoundedArchiveResponse, 'function');
  assert.equal(typeof installer.MAX_ARCHIVE_BYTES, 'number');
  const tooLarge = new Response(new Uint8Array([1]), {
    headers: { 'content-length': String(installer.MAX_ARCHIVE_BYTES + 1) },
  });
  await assert.rejects(() => installer.readBoundedArchiveResponse(tooLarge), /too large/i);
  const streamedTooLarge = new Response(new Uint8Array([1, 2, 3]));
  await assert.rejects(() => installer.readBoundedArchiveResponse(streamedTooLarge, 2), /too large/i);
});

test('rollback installer disables lifecycle scripts and bounds fetch duration', () => {
  const source = readFileSync(new URL('../../scripts/ops/install-verified-npm-package.mjs', import.meta.url), 'utf8');
  assert.match(source, /--ignore-scripts/);
  assert.match(source, /AbortSignal\.timeout/);
});
