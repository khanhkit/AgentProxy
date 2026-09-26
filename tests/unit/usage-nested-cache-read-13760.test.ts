import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("usage tracking preserves nested cache reads and clears stale nested cache writes", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "open-sse/utils/usageTracking.ts"),
    "utf8"
  );

  assert.match(
    source,
    /usage\?\.cached_tokens \?\?[\s\S]{0,120}usage\?\.prompt_tokens_details\?\.cached_tokens \?\?[\s\S]{0,120}usage\?\.input_tokens_details\?\.cached_tokens/
  );
  assert.match(source, /result\.cache_creation_tokens = 0/);
  assert.match(source, /result\.cache_write_tokens = 0/);

  const sanitizeFn =
    source.match(
      /export function sanitizeProviderUsageForRequest\([\s\S]*?\n\}\n\n\/\*\*/
    )?.[0] ?? "";
  assert.match(
    sanitizeFn,
    /result\.prompt_tokens_details = clearCachedTokenDetail\(result\.prompt_tokens_details\)/
  );
  assert.match(
    sanitizeFn,
    /result\.input_tokens_details = clearCachedTokenDetail\(result\.input_tokens_details\)/
  );
});
