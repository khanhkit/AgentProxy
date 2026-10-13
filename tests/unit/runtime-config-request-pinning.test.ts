import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  activateRuntimeConfigCandidate,
  getActiveRuntimeConfigSnapshot,
  resetRuntimeConfigAuthorityForTests,
} from "../../src/lib/config/runtimeConfigAuthority.ts";
import type { GuardrailContext } from "../../src/lib/guardrails/base.ts";
import { AudioBridgeGuardrail } from "../../src/lib/guardrails/audioBridge.ts";
import { VideoBridgeGuardrail } from "../../src/lib/guardrails/videoBridge.ts";
import { VisionBridgeGuardrail } from "../../src/lib/guardrails/visionBridge.ts";
import { CredentialMaskerGuardrail } from "../../src/lib/guardrails/credentialMasker.ts";
import { buildPostCallGuardrailContext } from "../../open-sse/handlers/chatCore/postCallGuardrailContext.ts";

const here = dirname(fileURLToPath(import.meta.url));
const CHAT_PATH = join(here, "../../src/sse/handlers/chat.ts");

function candidate(
  revision: number,
  settings: Record<string, unknown>,
  featureFlagOverrides: Record<string, string> = {}
) {
  return { revision, settings, featureFlagOverrides };
}

function textPayload(model = "example/text-only") {
  return { model, messages: [{ role: "user", content: "hello" }] };
}

test.beforeEach(() => {
  resetRuntimeConfigAuthorityForTests();
  delete process.env.CREDENTIAL_REDACTION_ENABLED;
});

test("post-call context keeps the exact pinned revision N objects after N+1 activates", async () => {
  await activateRuntimeConfigCandidate(
    candidate(40, { marker: "revision-40" }, { FEATURE_A: "on" }),
    {}
  );
  const pinned = getActiveRuntimeConfigSnapshot();
  assert.ok(pinned);

  const preContext = {
    runtimeSettings: pinned.settings,
    runtimeFeatureFlagOverrides: pinned.featureFlagOverrides,
    runtimeSettingsRevision: pinned.revision,
  } as GuardrailContext;

  await activateRuntimeConfigCandidate(
    candidate(41, { marker: "revision-41" }, { FEATURE_A: "off" }),
    {}
  );

  const postContext = buildPostCallGuardrailContext({
    apiKeyInfo: null,
    body: textPayload(),
    clientRawRequest: null,
    model: "example/text-only",
    provider: "example",
    responsePayloadFormat: "openai",
    clientResponseFormat: "openai",
    runtimeSettings: pinned.settings,
    runtimeFeatureFlagOverrides: pinned.featureFlagOverrides,
    runtimeSettingsRevision: pinned.revision,
  } as Parameters<typeof buildPostCallGuardrailContext>[0]);

  assert.strictEqual(postContext.runtimeSettings, preContext.runtimeSettings);
  assert.strictEqual(
    postContext.runtimeFeatureFlagOverrides,
    preContext.runtimeFeatureFlagOverrides
  );
  assert.equal(postContext.runtimeSettingsRevision, 40);
  assert.equal(postContext.runtimeSettings?.marker, "revision-40");
  assert.equal(getActiveRuntimeConfigSnapshot()?.revision, 41);
});

test("Audio Bridge uses pinned runtime settings without invoking injected settings loader", async () => {
  let settingsLoads = 0;
  const guardrail = new AudioBridgeGuardrail({
    deps: {
      getSettings: async () => {
        settingsLoads++;
        return { modalityBridgeAudioEnabled: true };
      },
      getCapabilities: () => ({ supportsAudio: false }),
    },
  });

  await guardrail.preCall(textPayload(), {
    model: "example/text-only",
    runtimeSettings: { modalityBridgeAudioEnabled: false },
  } as GuardrailContext);

  assert.equal(settingsLoads, 0);
});

test("Video Bridge uses pinned runtime settings without invoking injected settings loader", async () => {
  let settingsLoads = 0;
  const guardrail = new VideoBridgeGuardrail({
    deps: {
      getSettings: async () => {
        settingsLoads++;
        return { modalityBridgeVideoEnabled: true };
      },
      getCapabilities: () => ({ supportsVideo: false }),
    },
  });

  await guardrail.preCall(textPayload(), {
    model: "example/text-only",
    runtimeSettings: { modalityBridgeVideoEnabled: false },
  } as GuardrailContext);

  assert.equal(settingsLoads, 0);
});

test("Vision Bridge uses pinned runtime settings without invoking injected settings loader", async () => {
  let settingsLoads = 0;
  const guardrail = new VisionBridgeGuardrail({
    deps: {
      getSettings: async () => {
        settingsLoads++;
        return { modalityBridgeVisionEnabled: true };
      },
      checkModelHasComboMapping: async () => true,
    },
  });

  await guardrail.preCall(textPayload(), {
    model: "example/text-only",
    runtimeSettings: { modalityBridgeVisionEnabled: false },
  } as GuardrailContext);

  assert.equal(settingsLoads, 0);
});

test("Credential Masker honors pinned runtime config rather than the raw DB value", async () => {
  const guardrail = new CredentialMaskerGuardrail();
  const result = await guardrail.preCall({ headers: { Authorization: "Bearer request-secret" } }, {
    runtimeSettings: { credentialRedactionEnabled: true },
  } as GuardrailContext);

  assert.deepEqual(result?.modifiedPayload, {
    headers: { Authorization: "Bearer [REDACTED:auth_header]" },
  });
});

test("per-request disabledGuardrails still overrides pinned globally enabled bridge", async () => {
  let settingsLoads = 0;
  const guardrail = new AudioBridgeGuardrail({
    deps: {
      getSettings: async () => {
        settingsLoads++;
        throw new Error("must not load settings when request disables guardrail");
      },
    },
  });

  const result = await guardrail.preCall(textPayload(), {
    disabledGuardrails: ["audio-bridge"],
    runtimeSettings: { modalityBridgeAudioEnabled: true },
  } as GuardrailContext);

  assert.equal(result.modifiedPayload, undefined);
  assert.equal(settingsLoads, 0);
});

test("chat wiring captures one active snapshot and threads it through guardrails and cached settings", () => {
  const code = readFileSync(CHAT_PATH, "utf8");
  assert.match(code, /getActiveRuntimeConfigSnapshot\s*\(\s*\)/);
  assert.match(code, /runtimeSettings:\s*pinnedRuntimeSettings/);
  assert.match(code, /runtimeSettingsRevision:\s*pinnedRuntimeSettingsRevision/);
  assert.match(code, /cachedSettings:\s*pinnedRuntimeSettings/);
  assert.match(
    code,
    /const\s+pinnedRuntimeFeatureFlagOverrides\s*=\s*runtimeConfigSnapshot\?\.featureFlagOverrides\s*;/,
    "no active snapshot must preserve DB > env > default feature-flag fallback"
  );
  assert.doesNotMatch(
    code,
    /const\s+settingsForContinuation\s*=\s*await\s+getCachedSettings\s*\(/,
    "continuation mode must come from the request-pinned runtime snapshot"
  );
});
