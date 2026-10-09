#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const EXACT_SPEC = /^agentproxy@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;
const REGISTRY_HOST = 'registry.npmjs.org';
export const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 60_000;

export function validateExactSpec(spec) {
  if (!EXACT_SPEC.test(spec)) throw new Error(`refusing non-exact AgentProxy package spec: ${spec}`);
  return spec;
}

export function validateRegistryMetadata(metadata) {
  const tarball = metadata?.['dist.tarball'];
  const integrity = metadata?.['dist.integrity'];
  if (typeof tarball !== 'string' || typeof integrity !== 'string') {
    throw new Error('npm registry metadata missing dist.tarball or dist.integrity');
  }
  const url = new URL(tarball);
  if (url.protocol !== 'https:' || url.hostname !== REGISTRY_HOST || url.port || url.username || url.password) {
    throw new Error(`refusing untrusted npm tarball URL: ${tarball}`);
  }
  const match = /^sha512-([A-Za-z0-9+/]+={0,2})$/.exec(integrity);
  if (!match) throw new Error(`refusing unsupported npm integrity: ${integrity}`);
  const expected = Buffer.from(match[1], 'base64');
  if (expected.length !== 64) throw new Error('invalid sha512 integrity length');
  return { tarball: url.toString(), integrity, expected };
}

export function verifySha512(bytes, expected) {
  const actual = createHash('sha512').update(bytes).digest();
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function readBoundedArchiveResponse(response, maxBytes = MAX_ARCHIVE_BYTES) {
  const declared = response.headers.get('content-length');
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length < 0) throw new Error('invalid npm tarball content-length');
    if (length > maxBytes) throw new Error(`npm tarball too large: ${length} bytes`);
  }
  if (!response.body) throw new Error('npm tarball response body missing');
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new Error(`npm tarball too large: exceeds ${maxBytes} bytes`);
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  return Buffer.concat(chunks, total);
}

function npmViewMetadata(spec) {
  const result = spawnSync(
    'npm',
    ['view', spec, 'dist.tarball', 'dist.integrity', '--json'],
    { encoding: 'utf8', env: process.env }
  );
  if (result.status !== 0) {
    throw new Error(`npm view failed for ${spec}: ${result.stderr || result.stdout}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`invalid npm registry metadata for ${spec}: ${error.message}`);
  }
}

async function downloadVerifiedArchive(spec, fetchImpl = fetch) {
  const metadata = validateRegistryMetadata(npmViewMetadata(spec));
  const response = await fetchImpl(metadata.tarball, { redirect: 'error', signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`npm tarball download failed: HTTP ${response.status}`);
  const bytes = await readBoundedArchiveResponse(response);
  if (!verifySha512(bytes, metadata.expected)) {
    throw new Error(`sha512 integrity mismatch for ${spec}`);
  }
  return bytes;
}

export async function installVerifiedPackage(spec) {
  validateExactSpec(spec);
  const dir = await mkdtemp(path.join(tmpdir(), 'agentproxy-rollback-'));
  const archivePath = path.join(dir, 'package.tgz');
  try {
    const bytes = await downloadVerifiedArchive(spec);
    await writeFile(archivePath, bytes, { mode: 0o600 });
    const installed = spawnSync(
      'npm', ['install', '-g', archivePath, '--ignore-scripts', '--no-audit', '--no-fund'], { stdio: 'inherit' }
    );
    if (installed.status !== 0) throw new Error(`npm local archive install failed for ${spec}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const spec = process.argv[2];
  if (!spec) {
    console.error('usage: install-verified-npm-package.mjs agentproxy@<exact-version>');
    process.exitCode = 2;
  } else {
    installVerifiedPackage(spec).catch((error) => {
      console.error(`[verified-npm-install] ${error.message}`);
      process.exitCode = 1;
    });
  }
}
