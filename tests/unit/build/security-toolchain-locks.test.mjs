import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

test('authoritative npm source is an exact registry tarball pinned by sha512, not a vulnerable npm lock tree', () => {
  const source = readJson('.github/toolchains/npm-source.json');
  assert.equal(source.version, '12.0.2');
  assert.equal(source.tarball, 'https://registry.npmjs.org/npm/-/npm-12.0.2.tgz');
  assert.match(source.integrity, /^sha512-[A-Za-z0-9+/]+=*$/);
  assert.equal(existsSync('.github/toolchains/npm/package-lock.json'), false);
});

test('npm CVE overlay itself uses patched releases', () => {
  const pkg = readJson('docker/npm-cve-patch/package.json');
  assert.deepEqual(pkg.dependencies, {
    'brace-expansion': '5.0.12',
    'http-cache-semantics': '4.3.0',
    'ip-address': '10.7.3',
    'postcss-selector-parser': '7.1.6',
    tar: '7.5.22',
    undici: '6.29.0',
  });
});

test('authoritative npm extraction is safe for Windows drive-letter archive paths', () => {
  const src = readFileSync('scripts/ci/bootstrap-authoritative-npm.mjs', 'utf8');
  assert.match(src, /spawnSync\('tar', \['-xzf', path\.basename\(archive\), '-C', targetDir\], \{ cwd: temp,/);
});

test('runtime CLI lock overrides vulnerable transitive MCP and undici releases', () => {
  const pkg = readJson('docker/runtime-cli-tools/package.json');
  assert.equal(pkg.overrides['@modelcontextprotocol/sdk'], '1.32.1');
  assert.equal(pkg.overrides.undici, '8.11.2');
});
