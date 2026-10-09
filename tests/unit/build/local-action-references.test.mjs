import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const workflows = join(process.cwd(), '.github', 'workflows');

test('workflow local actions use valid relative paths to existing action metadata', () => {
  let checked = 0;
  for (const file of readdirSync(workflows).filter((name) => /\.ya?ml$/.test(name))) {
    const content = readFileSync(join(workflows, file), 'utf8');
    for (const [, target] of content.matchAll(/^\s*-\s*uses:\s*([^\s#]+)/gm)) {
      if (!target.includes('/.github/actions/')) continue;
      assert.match(target, /^\.\/\.github\/actions\/[\w./-]+$/, `${file}: invalid local action path ${target}`);
      assert.ok(
        existsSync(join(process.cwd(), target, 'action.yml')) ||
          existsSync(join(process.cwd(), target, 'action.yaml')),
        `${file}: local action metadata missing for ${target}`,
      );
      checked++;
    }
  }
  assert.ok(checked > 0, 'expected to validate local action references');
});


test("third-party workflow actions are pinned to full 40-character commit SHAs", () => {
  const externalAction = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@(.+)$/;
  for (const file of readdirSync(workflows).filter((name) => /\.ya?ml$/.test(name))) {
    const content = readFileSync(join(workflows, file), "utf8");
    for (const [, target] of content.matchAll(/^\s*-\s*uses:\s*([^\s#]+)/gm)) {
      if (target.startsWith("./")) continue;
      const match = externalAction.exec(target);
      if (!match) continue;
      assert.match(match[2], /^[0-9a-f]{40}$/, `${file}: external action is not pinned to a full commit SHA: ${target}`);
    }
  }
});


test("raw GitHub workflow downloads use immutable 40-character commit refs", () => {
  const rawGithub = /https:\/\/raw\.githubusercontent\.com\/[^/\s]+\/[^/\s]+\/([^/\s"']+)\//g;
  for (const file of readdirSync(workflows).filter((name) => /\.ya?ml$/.test(name))) {
    const content = readFileSync(join(workflows, file), "utf8");
    for (const match of content.matchAll(rawGithub)) {
      assert.match(match[1], /^[0-9a-f]{40}$/, `${file}: raw GitHub download is not commit-pinned: ${match[0]}`);
    }
  }
});


test("workflows do not execute downloaded shell scripts directly", () => {
  for (const file of readdirSync(workflows).filter((name) => /\.ya?ml$/.test(name))) {
    const content = readFileSync(join(workflows, file), "utf8");
    assert.doesNotMatch(content, /bash\s+<\(curl\b/, `${file}: downloaded shell script is executed directly`);
  }
});


test("quickstart does not stream downloaded response bytes into an interpreter", () => {
  const quickstart = readFileSync(join(process.cwd(), "examples", "quickstart", "curl_terminal.sh"), "utf8");
  assert.doesNotMatch(quickstart, /curl[\s\S]*?\|\s*python3\b/, "quickstart must separate HTTP response retrieval from local parsing");
});

test('zizmor is installed from a checksum-verified exact release asset, not pip', () => {
  for (const workflowPath of ['.github/workflows/ci.yml', '.github/workflows/quality.yml']) {
    const workflow = readFileSync(join(process.cwd(), workflowPath), 'utf8');
    assert.doesNotMatch(workflow, /pipx install [^\n]*zizmor|pip install [^\n]*zizmor/);
    assert.match(workflow, /zizmor-x86_64-unknown-linux-gnu\.tar\.gz/);
    assert.match(workflow, /aa1facd105f0d83fe5c55b1adcd9d7417de5d83aa27471f91dc0b66cf3803577/);
    assert.match(workflow, /sha256sum -c/);
  }
});

test('Schemathesis DAST install is hash-locked through a committed requirements lock', () => {
  const workflow = readFileSync(join(process.cwd(), '.github', 'workflows', 'dast-smoke.yml'), 'utf8');
  assert.match(workflow, /pip install --require-hashes -r \.github\/requirements\/schemathesis\.lock/);
  assert.doesNotMatch(workflow, /pip install schemathesis==/);
  const lock = readFileSync(join(process.cwd(), '.github', 'requirements', 'schemathesis.lock'), 'utf8');
  assert.match(lock, /schemathesis==4\.27\.1/);
  for (const block of lock.split(/\n(?=[a-zA-Z0-9_.-]+==)/)) {
    if (!/^[a-zA-Z0-9_.-]+==/m.test(block)) continue;
    assert.match(block, /--hash=sha256:/, `dependency block must be hash locked: ${block.split('\n')[0]}`);
  }
});

test('authoritative npm CI bootstrap uses a committed lockfile and npm ci, never npm install -g', () => {
  const helper = readFileSync(join(process.cwd(), 'scripts', 'ci', 'bootstrap-authoritative-npm.sh'), 'utf8');
  assert.match(helper, /toolchain_dir=.*\.github\/toolchains\/npm/);
  assert.match(helper, /npm ci --prefix \"\$toolchain_dir\"/);
  assert.doesNotMatch(helper, /npm install\s+-g\s+npm@/);
  const pkg = JSON.parse(readFileSync(join(process.cwd(), '.github', 'toolchains', 'npm', 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(join(process.cwd(), '.github', 'toolchains', 'npm', 'package-lock.json'), 'utf8'));
  assert.equal(pkg.dependencies.npm, '12.0.2');
  assert.equal(lock.packages['node_modules/npm'].version, '12.0.2');
  assert.match(lock.packages['node_modules/npm'].integrity, /^sha512-/);
  for (const workflowPath of [
    '.github/workflows/build.yml',
    '.github/workflows/ci.yml',
    '.github/workflows/release-platforms.yml',
    '.github/workflows/self-hosted-arm64.yml',
    '.github/actions/npm-ci-retry/action.yml',
  ]) {
    const content = readFileSync(join(process.cwd(), workflowPath), 'utf8');
    assert.doesNotMatch(content, /npm install\s+-g\s+npm@12\.0\.2/);
  }
});
