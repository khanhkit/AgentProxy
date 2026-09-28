import assert from "node:assert/strict";
import test from "node:test";

import {
  CONFIG_API_KEY_HEADER,
  LEGACY_CONFIG_API_KEY_HEADER,
  configPreviewQuerySchema,
  configRequestSchema,
  readConfigApiKey,
} from "../../../src/lib/cli-helper/configRequest.ts";

test("preview query rejects credentials in the URL", () => {
  assert.equal(configPreviewQuerySchema.safeParse({ apiKey: "must-not-travel-in-url" }).success, false);
});

test("config request rejects base URLs with embedded credentials", () => {
  assert.equal(
    configRequestSchema.safeParse({
      toolId: "claude",
      baseUrl: "https://user:pass@example.test/v1",
      apiKey: "key",
    }).success,
    false
  );
});

test("canonical AgentProxy config-key header is accepted", () => {
  const req = new Request("http://localhost/api/cli-tools/config", {
    headers: { [CONFIG_API_KEY_HEADER]: "agentproxy-secret" },
  });
  assert.equal(readConfigApiKey(req), "agentproxy-secret");
});

test("legacy OmniRoute config-key header remains a migration alias", () => {
  const req = new Request("http://localhost/api/cli-tools/config", {
    headers: { [LEGACY_CONFIG_API_KEY_HEADER]: "legacy-secret" },
  });
  assert.equal(readConfigApiKey(req), "legacy-secret");
});

test("canonical header wins when both aliases are present", () => {
  const req = new Request("http://localhost/api/cli-tools/config", {
    headers: {
      [CONFIG_API_KEY_HEADER]: "canonical-secret",
      [LEGACY_CONFIG_API_KEY_HEADER]: "legacy-secret",
    },
  });
  assert.equal(readConfigApiKey(req), "canonical-secret");
});
