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
