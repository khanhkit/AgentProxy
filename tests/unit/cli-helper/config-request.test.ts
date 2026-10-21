import assert from "node:assert/strict";
import test from "node:test";

import {
  CONFIG_API_KEY_HEADER,
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

test("unrecognized config-key header never authenticates the request", () => {
  const req = new Request("http://localhost/api/cli-tools/config", {
    headers: { "x-unrecognized-config-api-key": "untrusted-secret" },
  });
  assert.equal(readConfigApiKey(req), null);
});

test("canonical config-key header wins over unrelated unrecognized headers", () => {
  const req = new Request("http://localhost/api/cli-tools/config", {
    headers: {
      [CONFIG_API_KEY_HEADER]: "canonical-secret",
      "x-unrecognized-config-api-key": "untrusted-secret",
    },
  });
  assert.equal(readConfigApiKey(req), "canonical-secret");
});
