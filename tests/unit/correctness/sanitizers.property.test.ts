import test from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { configureProperties } from "../../helpers/propertyConfig.ts";
import { sanitizeErrorMessage } from "../../../open-sse/utils/error.ts";
import { containsStrongCredentialToken } from "../../../open-sse/utils/errorSanitization.ts";

configureProperties();

test("sanitizeErrorMessage never leaks a file path / stack frame", () => {
  // sanitizeErrorMessage takes only the FIRST LINE of input (observed real behavior:
  // it splits on \n and processes only the part before the first newline).
  // Stack frames are on subsequent lines and thus already stripped.
  // The invariant we test: single-line content containing "at /path/file.ts" has the
  // absolute path replaced with "<path>", so the output never contains "at /".
  const firstLineWithPath = fc
    .string()
    .map((s) => s.replace(/\n/g, " ")) // ensure single line
    .chain((prefix) =>
      fc
        .string()
        .map((s) => s.replace(/\n/g, " "))
        .map((suffix) => `${prefix} at /home/app/open-sse/foo.ts:42:10 ${suffix}`)
    );

  fc.assert(
    fc.property(firstLineWithPath, (input) => {
      const out = sanitizeErrorMessage(input);
      assert.ok(!out.includes("at /"), `leaked path in: ${JSON.stringify(out)}`);
    })
  );
});

test("strong credential detection stays bounded on long benign tokens (ReDoS guard)", () => {
  // Warm lazy regex/JIT initialization so this measures algorithmic behavior,
  // not module startup on a shared runner.
  containsStrongCredentialToken("warmup");
  const benign = "a".repeat(30_000);
  const detectorStart = process.hrtime.bigint();
  const found = containsStrongCredentialToken(benign);
  const detectorMs = Number(process.hrtime.bigint() - detectorStart) / 1e6;

  assert.equal(found, false);
  // The former unanchored [A-Za-z0-9]{3,}sk- branch takes ~2s on this
  // input; the boundary-anchored linear form is sub-millisecond locally.
  assert.ok(detectorMs < 500, `credential detector too slow: ${detectorMs.toFixed(2)}ms`);

  // Keep an end-to-end catastrophe guard as well. sanitizeErrorMessage caps its
  // scan window, so this should remain comfortably bounded even under CI load.
  const sanitizeStart = process.hrtime.bigint();
  sanitizeErrorMessage("a".repeat(20_000) + "@" + "b".repeat(20_000) + ".com");
  const sanitizeMs = Number(process.hrtime.bigint() - sanitizeStart) / 1e6;
  assert.ok(sanitizeMs < 1_000, `sanitizer unexpectedly slow: ${sanitizeMs.toFixed(2)}ms`);
});
