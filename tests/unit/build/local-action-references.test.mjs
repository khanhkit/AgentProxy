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
