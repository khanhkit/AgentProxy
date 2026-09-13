import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * GLM's translateSseResponse needs a provider-specific 64 KB stream queue.
 * The stream helper now exposes streamBufferBytes as its 16th positional, so
 * the GLM call must keep the explicit buffer argument wired to that final slot.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function extractParens(src: string, openAt: number): string {
  let i = openAt + 1;
  let depth = 1;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    i += 1;
  }
  return src.slice(openAt, i);
}

test("createSSETransformStreamWithLogger exposes streamBufferBytes as its final slot", () => {
  const src = readFileSync(join(root, "open-sse", "utils", "stream.ts"), "utf8");
  const needle = "export function createSSETransformStreamWithLogger(";
  const start = src.indexOf(needle);
  assert.ok(start >= 0);
  const header = extractParens(src, start + needle.length - 1);
  assert.match(header, /requestToolIdentityMap/);
  assert.match(header, /suppressThinkClose/);
  assert.match(header, /streamBufferBytes:[\s\S]*DEFAULT_STREAM_BUFFER_BYTES\s*\)\s*$/);
});

test("GLM translateSseResponse wires its 64 KB buffer into the final stream-helper slot", () => {
  const src = readFileSync(join(root, "open-sse", "executors", "glm.ts"), "utf8");
  const fnStart = src.indexOf("export function translateSseResponse(");
  assert.ok(fnStart >= 0);
  const fnEnd = src.indexOf("\nexport class GlmExecutor", fnStart);
  const body = src.slice(fnStart, fnEnd);
  const callAt = body.indexOf("createSSETransformStreamWithLogger(");
  assert.ok(callAt >= 0);
  const call = extractParens(body, callAt + "createSSETransformStreamWithLogger".length);
  assert.equal(/65536/.test(call), false, `buffer size must use the named constant:\n${call}`);
  assert.match(call, /suppressThinkClose,[\s\S]*GLM_STREAM_BUFFER_BYTES\s*\)\s*$/);
});
