import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadPortableJobs, validatePortableJobs } from '../../../scripts/ci/validate-portable-jobs.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const manifestPath = path.join(repoRoot, '.github/ci/portable-jobs.json');

async function invalidManifest(mutator) {
  const manifest = await loadPortableJobs(manifestPath);
  mutator(manifest);
  return manifest;
}

test('manifest classifies every ci.yml job exactly once', async () => {
  const manifest = await loadPortableJobs(manifestPath);
  const workflow = await (await import('node:fs/promises')).readFile(path.join(repoRoot, '.github/workflows/ci.yml'), 'utf8');
  const jobsBlock = workflow.slice(workflow.indexOf('\njobs:\n') + 6);
  const jobIds = [...jobsBlock.matchAll(/^  ([a-z0-9][a-z0-9-]*):\s*$/gm)].map((m) => m[1]);
  assert.deepEqual(Object.keys(manifest.jobs).sort(), jobIds.sort());
  for (const [id, job] of Object.entries(manifest.jobs)) {
    assert.ok(job.compatibleRunners.length >= 1, `${id} must declare compatible runners`);
    assert.ok(job.compatibility?.os?.length >= 1, `${id} must declare OS compatibility`);
    assert.ok(job.compatibility?.arch?.length >= 1, `${id} must declare architecture compatibility`);
    assert.ok(job.compatibility?.runtimeRequirements?.length >= 1, `${id} must declare runtime requirements`);
  }
});

test('portable fallback jobs use bounded queue timeout and multiple unique known runners', async () => {
  const manifest = await loadPortableJobs(manifestPath);
  for (const [id, job] of Object.entries(manifest.jobs)) {
    if (!job.fallbackEnabled) continue;
    assert.equal(job.class, 'portable-compute', `${id} fallback requires portable-compute class`);
    assert.equal(job.mutationClass, 'readonly', `${id} fallback must be side-effect free`);
    assert.ok(job.queueTimeoutSeconds >= 30 && job.queueTimeoutSeconds <= 60, `${id} timeout must be 30..60s`);
    assert.ok(job.compatibleRunners.length >= 2, `${id} needs at least two fallback runners`);
    assert.equal(new Set(job.compatibleRunners).size, job.compatibleRunners.length, `${id} runner list must be unique`);
  }
});

test('validator rejects unknown and duplicate runner labels', async () => {
  const unknown = await invalidManifest((m) => { m.jobs['test-vitest'].compatibleRunners = ['ubuntu-latest', 'mystery-os']; });
  assert.throws(() => validatePortableJobs(unknown), /unknown runner/i);
  const duplicate = await invalidManifest((m) => { m.jobs['test-vitest'].compatibleRunners = ['ubuntu-latest', 'ubuntu-latest']; });
  assert.throws(() => validatePortableJobs(duplicate), /duplicate runner/i);
});

test('validator rejects out-of-range queue timeout', async () => {
  const invalid = await invalidManifest((m) => { m.jobs['test-vitest'].fallbackEnabled = true; m.jobs['test-vitest'].queueTimeoutSeconds = 15; });
  assert.throws(() => validatePortableJobs(invalid), /30\.\.60/i);
});

test('validator fails closed when a mutating or release job enables fallback', async () => {
  const invalid = await invalidManifest((m) => {
    m.jobs['package-artifact'].class = 'portable-compute';
    m.jobs['package-artifact'].fallbackEnabled = true;
    m.jobs['package-artifact'].compatibleRunners = ['ubuntu-latest', 'windows-latest'];
  });
  assert.throws(() => validatePortableJobs(invalid), /readonly/i);
});
