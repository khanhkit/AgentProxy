import test from "node:test";
import assert from "node:assert/strict";

const { redactErrorPaths } = await import("../../open-sse/utils/errorPathRedaction.ts");

test("#13144: API route in prose does not truncate the remediation tail", () => {
  const input =
    "Model 'huggingface/stabilityai/stable-diffusion-xl-base-1.0' is an image-generation " +
    "model and cannot be used on /v1/chat/completions. Use POST /v1/images/generations instead.";
  const out = redactErrorPaths(input);
  assert.match(out, /Use POST \/v1\/images\/generations instead\.$/);
  assert.equal(out.endsWith("instead."), true);
});

test("#13144: separator evidence alone does not swallow the rest of the line", () => {
  for (const route of ["/v1/chat/completions", "/zz/chat/completions", "/v1/chat"]) {
    const input = `on ${route}. Contact support.`;
    assert.equal(redactErrorPaths(input), input, route);
  }
});

test("#13144: deterministic filename extension keeps following prose", () => {
  const cases: Array<[string, string]> = [
    ["at C:\\Program Files\\secret\\a.ts and more", "at <path> and more"],
    ["failed at /Users/alice/My Project/app.ts and more", "failed at <path> and more"],
    [
      "Provider failed in /srv/agentproxy/src/private/provider.ts:42:7 with api_key='x'",
      "Provider failed in <path> with api_key='x'",
    ],
  ];
  for (const [input, expected] of cases) {
    const out = redactErrorPaths(input);
    assert.equal(out, expected);
    assert.ok(!/secret|alice|agentproxy/.test(out), out);
  }
});

test("#13144: unequivocal filesystem prefix without endpoint still fails closed", () => {
  const out = redactErrorPaths("reading /etc/shadow copy failed");
  assert.equal(out, "reading <path>");
  assert.ok(!/shadow/.test(out));
});
