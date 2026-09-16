import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../packages/browser-pool/src/services/browserBackedChat.ts", import.meta.url),
  "utf8"
);

function extractFunction(name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const open = source.indexOf("{", start);
  assert.notEqual(open, -1, `${name} must have a body`);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

test("startBrowserWarmup does not allocate an unowned page per warmup call", () => {
  const fn = extractFunction("startBrowserWarmup");
  assert.match(fn, /await acquireBrowserContext\s*\(/);
  assert.doesNotMatch(
    fn,
    /\bopenPage\s*\(/,
    "repeated warmups must rely on the context-owned warmup page instead of leaking one extra page per call"
  );
});

test("startBrowserWarmup short-circuits an already-cancelled request before acquisition", () => {
  const fn = extractFunction("startBrowserWarmup");
  const aborted = fn.indexOf("signal?.aborted");
  const acquire = fn.indexOf("acquireBrowserContext");
  assert.ok(aborted >= 0, "warmup must check an already-aborted signal");
  assert.ok(aborted < acquire, "abort check must happen before browser context acquisition");
});
