/**
 * Regression for the AgentProxy vision self-loop credential.
 *
 * The internal bridge must use the per-process self-loop bearer accepted by
 * API-key validation. It must not create a persistent DB key, send the internal
 * bearer to an unrelated localhost service, or fall back to a checked-in sentinel.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-vision-selfloop-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.API_KEY_SECRET = "vision-selfloop-test-secret";
delete process.env.AGENTPROXY_API_KEY;
delete process.env.ROUTER_API_KEY;

const core = await import("../../../src/lib/db/core.ts");
const apiKeys = await import("../../../src/lib/db/apiKeys.ts");
const { resolveSelfLoopBearer } = await import(
  "../../../src/shared/middleware/chatAdmissionIdentity.ts"
);
const { callVisionModel } = await import("../../../src/lib/guardrails/visionBridgeHelpers.ts");

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

test("the generated self-loop bearer is accepted without a persisted API key", async () => {
  const bearer = resolveSelfLoopBearer();
  assert.notEqual(bearer, "sk_agentproxy");
  assert.equal(await apiKeys.validateApiKey(bearer), true);
  assert.equal((await apiKeys.getApiKeys()).length, 0);
});

test("an unrelated localhost vision endpoint never receives AgentProxy's self-loop bearer", async () => {
  const oldBase = process.env.VISION_BRIDGE_BASE_URL;
  process.env.VISION_BRIDGE_BASE_URL = "http://localhost:11434/v1";
  let authorization: string | undefined;
  try {
    await callVisionModel("data:image/png;base64,iVBORw0KGgo", {
      model: "openai/gpt-4o-mini",
      prompt: "Describe",
      timeoutMs: 30000,
      maxImages: 1,
      fetchImpl: async (_input, init) => {
        authorization = (init?.headers as Record<string, string> | undefined)?.Authorization;
        return Response.json({ choices: [{ message: { content: "ok" } }] });
      },
    });
    assert.notEqual(authorization, `Bearer ${resolveSelfLoopBearer()}`);
  } finally {
    if (oldBase === undefined) delete process.env.VISION_BRIDGE_BASE_URL;
    else process.env.VISION_BRIDGE_BASE_URL = oldBase;
  }
});

test("the own listener uses the self-loop bearer and admission bypass", async () => {
  const oldBase = process.env.VISION_BRIDGE_BASE_URL;
  const oldPort = process.env.PORT;
  process.env.PORT = "20128";
  process.env.VISION_BRIDGE_BASE_URL = "http://127.0.0.1:20128/v1";
  let headers: Record<string, string> = {};
  try {
    await callVisionModel("data:image/png;base64,iVBORw0KGgo", {
      model: "openai/gpt-4o-mini",
      prompt: "Describe",
      timeoutMs: 30000,
      maxImages: 1,
      fetchImpl: async (_input, init) => {
        headers = (init?.headers ?? {}) as Record<string, string>;
        return Response.json({ choices: [{ message: { content: "ok" } }] });
      },
    });
    assert.equal(headers.Authorization, `Bearer ${resolveSelfLoopBearer()}`);
    assert.equal(headers["x-agentproxy-admission-bypass"], "internal");
    assert.equal(headers["x-agentproxy-compression"], "off");
    assert.equal((await apiKeys.getApiKeys()).length, 0);
  } finally {
    if (oldBase === undefined) delete process.env.VISION_BRIDGE_BASE_URL;
    else process.env.VISION_BRIDGE_BASE_URL = oldBase;
    if (oldPort === undefined) delete process.env.PORT;
    else process.env.PORT = oldPort;
  }
});
