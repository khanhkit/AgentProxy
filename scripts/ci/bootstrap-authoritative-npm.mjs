#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash, timingSafeEqual } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PATCH_PACKAGES = [
  'brace-expansion',
  'http-cache-semantics',
  'ip-address',
  'postcss-selector-parser',
  'tar',
  'undici',
];

function verifyIntegrity(bytes, integrity) {
  const m = /^sha512-([A-Za-z0-9+/]+={0,2})$/.exec(integrity);
  if (!m) throw new Error('authoritative npm integrity must be sha512');
  const expected = Buffer.from(m[1], 'base64');
  const actual = createHash('sha512').update(bytes).digest();
  return expected.length === 64 && timingSafeEqual(actual, expected);
}

async function main() {
  const [sourcePath, targetDir, overlayNodeModules] = process.argv.slice(2);
  if (!sourcePath || !targetDir || !overlayNodeModules) throw new Error('usage: bootstrap-authoritative-npm.mjs <source.json> <target> <overlay-node_modules>');
  const source = JSON.parse(await readFile(sourcePath, 'utf8'));
  const url = new URL(source.tarball);
  if (url.protocol !== 'https:' || url.hostname !== 'registry.npmjs.org') throw new Error('untrusted npm source URL');
  const response = await fetch(url, { redirect: 'error' });
  if (!response.ok) throw new Error(`npm source download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!verifyIntegrity(bytes, source.integrity)) throw new Error('authoritative npm sha512 mismatch');

  const temp = await mkdtemp(path.join(tmpdir(), 'agentproxy-npm-source-'));
  try {
    const archive = path.join(temp, 'npm.tgz');
    await writeFile(archive, bytes, { mode: 0o600 });
    await rm(targetDir, { recursive: true, force: true });
    await mkdir(targetDir, { recursive: true });
    const extract = spawnSync('tar', ['-xzf', archive, '-C', targetDir], { stdio: 'inherit' });
    if (extract.status !== 0) throw new Error('failed to extract verified npm archive');
    for (const pkg of PATCH_PACKAGES) {
      const from = path.join(overlayNodeModules, pkg);
      const to = path.join(targetDir, 'package', 'node_modules', pkg);
      await rm(to, { recursive: true, force: true });
      await cp(from, to, { recursive: true });
    }
    const binDir = path.join(targetDir, 'bin');
    await mkdir(binDir, { recursive: true });
    await symlink(path.join('..', 'package', 'bin', 'npm-cli.js'), path.join(binDir, 'npm'));
    await symlink(path.join('..', 'package', 'bin', 'npx-cli.js'), path.join(binDir, 'npx'));
    const check = spawnSync('node', [path.join(targetDir, 'package', 'bin', 'npm-cli.js'), '--version'], { encoding: 'utf8' });
    if (check.status !== 0 || check.stdout.trim() !== source.version) throw new Error(`authoritative npm version mismatch: ${check.stdout.trim()}`);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(`[npm-bootstrap] ${error.message}`); process.exitCode = 1; });
