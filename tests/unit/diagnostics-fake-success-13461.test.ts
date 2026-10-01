import test from "node:test";
import assert from "node:assert/strict";

import { detectMalformedNonStream, describeMalformedNonStream } from "../../open-sse/utils/diagnostics.ts";
import { classifyFakeSuccessBody } from "../../open-sse/services/errorClassifier.ts";

function chatCompletion(content: string) {
  return {
    id: "chatcmpl-repro", object: "chat.completion",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
  };
}

test("#13461: short credits exhaustion is classified for Pollinations", () => {
  const content = "You have run out of credits. Please sign up to continue.";
  assert.equal(classifyFakeSuccessBody(content, "pollinations"), "quota_exhausted");
  assert.equal(detectMalformedNonStream(chatCompletion(content), "pollinations"), "content_is_upstream_error");
});

test("#13461: account suspension is classified for Perplexity web", () => {
  const content = "Sorry, your account has been suspended. Please contact support.";
  assert.equal(classifyFakeSuccessBody(content, "perplexity-web"), "account_deactivated");
});

test("#13461: identical error prose is untouched for non-allowlisted providers", () => {
  const content = "You have run out of credits. Please sign up to continue.";
  assert.equal(classifyFakeSuccessBody(content, "openai"), null);
  assert.equal(detectMalformedNonStream(chatCompletion(content), "openai"), null);
});

test("#13461: provider-less diagnostics preserve prior behavior", () => {
  const content = "You have run out of credits. Please sign up to continue.";
  assert.equal(detectMalformedNonStream(chatCompletion(content)), null);
});

test("#13461: long legitimate prose mentioning credits is not classified", () => {
  const content = (
    "Managing cloud spend requires budgeting and alerts so teams do not run out of credits unexpectedly. " +
    "A healthy billing process also reviews invoices, usage trends, commitments, and project forecasts every week. "
  ).repeat(3);
  assert.ok(content.length > 400);
  assert.equal(classifyFakeSuccessBody(content, "pollinations"), null);
});

test("#13461: short normal answer on allowlisted provider remains valid", () => {
  const body = chatCompletion("The capital of France is Paris.");
  assert.equal(detectMalformedNonStream(body, "pollinations"), null);
});

test("#13461: content-block text shape is classified too", () => {
  const body = { choices: [{ message: { content: [{ type: "text", text: "You have run out of credits." }] }, finish_reason: "stop" }] };
  assert.equal(detectMalformedNonStream(body, "pollinations"), "content_is_upstream_error");
});

test("#13461: synthetic malformed description is stable and sanitized", () => {
  assert.deepEqual(describeMalformedNonStream({}, "content_is_upstream_error"), {
    message: "upstream reported a failure disguised as a successful response",
    code: "upstream_fake_success",
    type: "upstream_response_error",
  });
});
