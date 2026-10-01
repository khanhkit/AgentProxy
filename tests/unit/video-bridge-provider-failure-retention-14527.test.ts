import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { projectRetainedProviderFailureMessage } =
  await import("../../open-sse/handlers/chatCore/providerFailureRetention.ts");

const CANARY = "VIDEO_CUE_PRIVATE_SENTINEL_7D2";
const upstreamMessage = `Authentication failed; cue ${CANARY}`;

test("#14527: video-sensitive retained failures use an omission marker", () => {
  const retained = projectRetainedProviderFailureMessage(upstreamMessage, true);
  assert.equal(retained, "Provider request failed [omitted: video transcript]");
  assert.doesNotMatch(retained, new RegExp(CANARY));
});

test("#14527: ordinary retained failures keep sanitized diagnostics", () => {
  const retained = projectRetainedProviderFailureMessage(upstreamMessage, false);
  assert.match(retained, /Authentication failed/);
  assert.match(retained, new RegExp(CANARY));
});

test("#14527: empty ordinary failure falls back to generic message", () => {
  assert.equal(projectRetainedProviderFailureMessage("", false), "Provider request failed");
});

test("#14527: chatCore wires videoBridgeObserved only into retained connection failure text", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const source = fs.readFileSync(path.join(root, "open-sse/handlers/chatCore.ts"), "utf8");
  assert.match(
    source,
    /const persistentMessage = projectRetainedProviderFailureMessage\(\s*message,\s*videoBridgeObserved\s*\);/m
  );
  assert.match(source, /classifyProviderError\(statusCode, message, provider\)/);
});
