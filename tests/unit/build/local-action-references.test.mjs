import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const workflows = join(process.cwd(), '.github', 'workflows');
const LOCAL_ACTION_REF = /^\.\/\.github\/actions\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
const EXTERNAL_ACTION_REF = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*@[0-9a-f]{40}$/;
const DIRECT_DOWNLOADED_EXECUTION = /(?:curl|wget)[^\n|]*\|\s*(?:bash|sh|zsh|dash|python(?:3)?|perl|ruby)\b|(?:bash|sh|zsh|dash|python(?:3)?|perl|ruby)\s+<\(\s*(?:curl|wget)\b|(?:eval|bash\s+-c|sh\s+-c)\s+["']?\$\(\s*(?:curl|wget)\b/i;

test('workflow local actions use valid relative paths to existing action metadata', () => {
  let checked = 0;
  for (const file of readdirSync(workflows).filter((name) => /\.ya?ml$/.test(name))) {
    const content = readFileSync(join(workflows, file), 'utf8');
    for (const [, target] of content.matchAll(/^\s*-\s*uses:\s*([^\s#]+)/gm)) {
      if (!target.includes('/.github/actions/')) continue;
      assert.match(target, LOCAL_ACTION_REF, `${file}: invalid local action path ${target}`);
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
  for (const file of readdirSync(workflows).filter((name) => /\.ya?ml$/.test(name))) {
    const content = readFileSync(join(workflows, file), "utf8");
    for (const [, target] of content.matchAll(/^\s*-\s*uses:\s*([^\s#]+)/gm)) {
      if (target.startsWith("./")) continue;
      assert.match(target, EXTERNAL_ACTION_REF, `${file}: invalid or unpinned external action: ${target}`);
    }
  }
});

test("action-reference policy rejects traversal and malformed external targets", () => {
  assert.doesNotMatch('./.github/actions/../secret', LOCAL_ACTION_REF);
  assert.doesNotMatch('./.github/actions/npm-ci-retry/../../secret', LOCAL_ACTION_REF);
  assert.match(`github/codeql-action/analyze@${'a'.repeat(40)}`, EXTERNAL_ACTION_REF);
  for (const bad of ['actions/checkout@v4', 'actions/checkout', 'owner/repo/path@main', 'docker://alpine:latest']) {
    assert.doesNotMatch(bad, EXTERNAL_ACTION_REF);
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
    assert.doesNotMatch(content, DIRECT_DOWNLOADED_EXECUTION, `${file}: downloaded content is executed directly`);
  }
  for (const bad of [
    'curl -fsSL https://example.invalid/x | bash',
    'wget -qO- https://example.invalid/x | python3',
    'bash <(curl -fsSL https://example.invalid/x)',
    'eval "$(curl -fsSL https://example.invalid/x)"',
  ]) {
    assert.match(bad, DIRECT_DOWNLOADED_EXECUTION);
  }
});

test("quickstart does not stream downloaded response bytes into an interpreter", () => {
  const quickstart = readFileSync(join(process.cwd(), "examples", "quickstart", "curl_terminal.sh"), "utf8");
  assert.doesNotMatch(quickstart, /curl[\s\S]*?\|\s*python3\b/, "quickstart must separate HTTP response retrieval from local parsing");
  assert.doesNotMatch(quickstart, /sys\.argv\[1\]/, "quickstart must not pass unbounded response bytes through argv");
  assert.match(quickstart, /json\.load\(sys\.stdin\)/, "quickstart must parse the buffered response from stdin");
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

test('authoritative npm CI bootstrap verifies an exact source tarball plus locked CVE overlay, never npm install -g', () => {
  const helper = readFileSync(join(process.cwd(), 'scripts', 'ci', 'bootstrap-authoritative-npm.sh'), 'utf8');
  const source = JSON.parse(readFileSync(join(process.cwd(), '.github', 'toolchains', 'npm-source.json'), 'utf8'));
  const overlayLock = JSON.parse(readFileSync(join(process.cwd(), 'docker', 'npm-cve-patch', 'package-lock.json'), 'utf8'));
  assert.equal(source.version, '12.0.2');
  assert.equal(source.tarball, 'https://registry.npmjs.org/npm/-/npm-12.0.2.tgz');
  assert.match(source.integrity, /^sha512-/);
  assert.match(helper, /npm ci --prefix "\$overlay_dir"/);
  assert.match(helper, /bootstrap-authoritative-npm\.mjs/);
  assert.match(helper, /npm-source\.json/);
  assert.match(helper, /source_version/);
  assert.doesNotMatch(helper, /test "\$\(npm --version\)" = "12\.0\.2"/);
  assert.equal(overlayLock.lockfileVersion, 3);
  assert.equal(existsSync(join(process.cwd(), '.github', 'toolchains', 'npm', 'package-lock.json')), false);
  assert.doesNotMatch(helper, /npm install\s+-g\s+npm@/);
  for (const workflowPath of [
    '.github/workflows/build.yml',
    '.github/workflows/ci.yml',
    '.github/workflows/release-platforms.yml',
    '.github/workflows/release-acceptance.yml',
    '.github/workflows/self-hosted-arm64.yml',
    '.github/actions/npm-ci-retry/action.yml',
  ]) {
    const content = readFileSync(join(process.cwd(), workflowPath), 'utf8');
    assert.match(content, /bootstrap-authoritative-npm\.sh|uses:\s*\.\/\.github\/actions\/npm-ci-retry/, `${workflowPath}: npm execution must use the authoritative bootstrap`);
    assert.doesNotMatch(content, /npm install\s+-g\s+npm@12\.0\.2/);
  }
});
