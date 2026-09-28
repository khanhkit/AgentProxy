import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { deriveBrowserContextPoolKey } from "../../open-sse/services/browserBackedChat.ts";

test("AP-0116 fresh mode stays unique even when injected secure IDs collide", () => {
  const fixedUuid = () => "00000000-0000-4000-8000-000000000000";

  const results = Array.from({ length: 64 }, () =>
    deriveBrowserContextPoolKey("provider:account", false, fixedUuid)
  );

  assert.ok(results.every((result) => result.acquired === false));
  assert.equal(new Set(results.map((result) => result.key)).size, results.length);
  assert.ok(
    results.every((result) =>
      /^provider:account:00000000-0000-4000-8000-000000000000:/.test(result.key)
    )
  );
});

test("AP-0116 reuse mode keeps the requested stable pool key", () => {
  const result = deriveBrowserContextPoolKey("provider:account", true, () => "should-not-be-used");

  assert.deepEqual(result, {
    key: "provider:account",
    acquired: true,
  });
});

test("AP-0116 source uses crypto randomUUID and removes Math.random isolation suffix", () => {
  const source = readFileSync("open-sse/services/browserBackedChat.ts", "utf8");

  assert.match(source, /from ["']node:crypto["']/);
  assert.match(source, /randomUUID/);
  assert.doesNotMatch(
    source,
    /Math\.random\(\).*fresh context|fresh context[\s\S]{0,300}Math\.random\(/i
  );
});
