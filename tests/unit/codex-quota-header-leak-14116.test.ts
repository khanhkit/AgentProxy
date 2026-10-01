import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildStreamingResponseHeaders,
  isCodexAccountQuotaHeader,
  type StreamingResponseHeadersMeta,
} from "../../open-sse/handlers/chatCore/responseHeaders.ts";
import { assembleStreamingResponseHeaders } from "../../open-sse/handlers/chatCore/streamingResponseHeaders.ts";

function value(headers: Record<string, string>, name: string): string | undefined {
  return Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
}

function upstream(): Headers {
  return new Headers({
    "x-codex-primary-used-percent": "41",
    "x-codex-primary-reset-after-seconds": "120",
    "x-codex-credits-has-credits": "true",
    "x-codex-plan-type": "team",
    "x-request-id": "req-14116",
  });
}

test("#14116: Codex account-quota header classifier is narrow", () => {
  assert.equal(isCodexAccountQuotaHeader("x-codex-primary-used-percent"), true);
  assert.equal(isCodexAccountQuotaHeader("x-codex-primary-reset-after-seconds"), true);
  assert.equal(isCodexAccountQuotaHeader("x-codex-plan-type"), true);
  assert.equal(isCodexAccountQuotaHeader("x-codex-turn-state"), false);
  assert.equal(isCodexAccountQuotaHeader("x-ratelimit-remaining"), false);
});

test("#14116: direct and same-account paths retain Codex quota headers", () => {
  for (const meta of [
    { isCombo: false, requestedConnectionId: "mine", selectedConnectionId: "mine" },
    { isCombo: true, requestedConnectionId: "mine", selectedConnectionId: "mine" },
    { isCombo: true, requestedConnectionId: null, selectedConnectionId: "other" },
  ] satisfies StreamingResponseHeadersMeta[]) {
    const out = buildStreamingResponseHeaders(upstream(), meta);
    assert.equal(value(out, "x-codex-primary-used-percent"), "41");
    assert.equal(value(out, "x-request-id"), "req-14116");
  }
});

test("#14116: foreign combo account strips only account-scoped Codex quota headers", () => {
  const h = upstream();
  h.set("x-codex-turn-state", "turn-state-safe");
  const out = buildStreamingResponseHeaders(h, {
    isCombo: true,
    requestedConnectionId: "mine",
    selectedConnectionId: "foreign",
  });
  assert.equal(value(out, "x-codex-primary-used-percent"), undefined);
  assert.equal(value(out, "x-codex-primary-reset-after-seconds"), undefined);
  assert.equal(value(out, "x-codex-credits-has-credits"), undefined);
  assert.equal(value(out, "x-codex-plan-type"), undefined);
  assert.equal(value(out, "x-codex-turn-state"), "turn-state-safe");
  assert.equal(value(out, "x-request-id"), "req-14116");
});

test("#14116: streaming assembler threads provenance metadata to the chokepoint", () => {
  const calls: Record<string, unknown>[] = [];
  const build: NonNullable<Parameters<typeof assembleStreamingResponseHeaders>[1]> = (
    _headers,
    meta
  ) => {
    calls.push(meta as Record<string, unknown>);
    return {};
  };
  assembleStreamingResponseHeaders(
    {
      providerHeaders: upstream(), provider: "codex", model: "gpt-5.6", pendingRequestId: "p1",
      isCombo: true, requestedConnectionId: "mine", selectedConnectionId: "foreign",
    },
    build
  );
  assert.equal(calls[0].isCombo, true);
  assert.equal(calls[0].requestedConnectionId, "mine");
  assert.equal(calls[0].selectedConnectionId, "foreign");
});
