import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const read = (p) => readFile(new URL(`../../../${p}`, import.meta.url), 'utf8');

test('worker is manual-only, exact-SHA, claim-guarded and non-racing', async () => {
  const y = await read('.github/workflows/portable-ci-worker.yml');
  assert.match(y, /workflow_dispatch:/);
  assert.doesNotMatch(y, /pull_request:|\n\s+push:/);
  assert.match(y, /statuses:\s*read/);
  assert.match(y, /runs-on:\s*\$\{\{\s*inputs\.runner\s*\}\}/);
  assert.match(y, /ref:\s*\$\{\{\s*inputs\.source_sha\s*\}\}/);
  assert.match(y, /wait-runner-claim\.mjs/);
  assert.match(y, /cancel-in-progress:\s*false/);
  assert.doesNotMatch(y, /matrix:/);
});

test('dispatcher has only control-plane permissions and invokes repository scheduler', async () => {
  const y = await read('.github/workflows/portable-ci-dispatch.yml');
  assert.match(y, /actions:\s*write/);
  assert.match(y, /statuses:\s*write/);
  assert.match(y, /contents:\s*read/);
  assert.match(y, /ubuntu-24\.04-arm/);
  assert.match(y, /github-runner-fallback\.mjs/);
});

test('existing required CI is not replaced before benchmark evidence exists', async () => {
  const y = await read('.github/workflows/ci.yml');
  assert.doesNotMatch(y, /portable-ci-(dispatch|worker)/);
  assert.match(y, /test-vitest:/);
});
