import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-audio-telemetry-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.API_KEY_SECRET = process.env.API_KEY_SECRET || "audio-telemetry-test-secret";

const core = await import("../../src/lib/db/core.ts");
const { createProviderNode } = await import("../../src/lib/db/providers.ts");
const { createCombo } = await import("../../src/lib/db/combos.ts");
const { createApiKey, updateApiKeyPermissions } = await import("../../src/lib/db/apiKeys.ts");
const { saveSyncedPricing, clearSyncedPricing } = await import("../../src/lib/pricingSync.ts");
const { flushSpendBatchWriter, resetSpendBatchWriterForTests } = await import(
  "../../src/lib/spend/batchWriter.ts"
);
const { waitForCallLogSaves } = await import("../../src/lib/usage/callLogs.ts");

await createProviderNode({
  id: "audio-telemetry-node-a",
  type: "openai-compatible",
  name: "Audio Telemetry A",
  prefix: "telemetrystta",
  apiType: "audio-transcriptions",
  baseUrl: "http://localhost:19431/v1",
} as Parameters<typeof createProviderNode>[0]);
await createProviderNode({
  id: "audio-telemetry-node-b",
  type: "openai-compatible",
  name: "Audio Telemetry B",
  prefix: "telemetrysttb",
  apiType: "audio-transcriptions",
  baseUrl: "http://localhost:19432/v1",
} as Parameters<typeof createProviderNode>[0]);
await createCombo({
  name: "audio-telemetry-combo",
  strategy: "priority",
  models: [
    { provider: "telemetrystta", model: "whisper-priced" },
    { provider: "telemetrysttb", model: "whisper-priced" },
  ],
} as Parameters<typeof createCombo>[0]);

saveSyncedPricing({
  telemetrystta: {
    "whisper-priced": { input: 0, output: 0, input_cost_per_second: 0.01 },
  },
  telemetrysttb: {
    "whisper-priced": { input: 0, output: 0, input_cost_per_second: 0.02 },
  },
});

const route = await import("../../src/app/api/v1/audio/transcriptions/route.ts");
const originalFetch = globalThis.fetch;

function makePcmWav(seconds = 1): Blob {
  const sampleRate = 16_000;
  const channels = 1;
  const bitsPerSample = 16;
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataLen = Math.round(byteRate * seconds);
  const b = Buffer.alloc(44 + dataLen);
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(36 + dataLen, 4);
  b.write("WAVE", 8, "ascii");
  b.write("fmt ", 12, "ascii");
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(channels, 22);
  b.writeUInt32LE(sampleRate, 24);
  b.writeUInt32LE(byteRate, 28);
  b.writeUInt16LE(blockAlign, 32);
  b.writeUInt16LE(bitsPerSample, 34);
  b.write("data", 36, "ascii");
  b.writeUInt32LE(dataLen, 40);
  return new Blob([b], { type: "audio/wav" });
}

function transcriptionRequest(model: string, file: Blob, bearer?: string): Request {
  const formData = new FormData();
  formData.set("model", model);
  formData.set("file", file, "clip.wav");
  const headers = new Headers();
  if (bearer) headers.set("authorization", `Bearer ${bearer}`);
  return new Request("http://localhost/v1/audio/transcriptions", {
    method: "POST",
    headers,
    body: formData,
  });
}

async function createCaller(noLog = false) {
  const key = await createApiKey(`audio-telemetry-${Date.now()}-${Math.random()}`, "audio-telemetry");
  if (noLog) await updateApiKeyPermissions(key.id, { noLog: true });
  return key;
}

async function settleWrites() {
  await waitForCallLogSaves(2_000);
  await flushSpendBatchWriter();
}

function rows(sql: string, ...params: unknown[]) {
  return core.getDbInstance().prepare(sql).all(...params) as Array<Record<string, unknown>>;
}

async function clearTelemetry() {
  await settleWrites();
  const db = core.getDbInstance();
  db.exec("DELETE FROM call_logs; DELETE FROM usage_history; DELETE FROM domain_cost_history;");
  resetSpendBatchWriterForTests();
}

test.afterEach(async () => {
  globalThis.fetch = originalFetch;
  await clearTelemetry();
});

test.after(async () => {
  globalThis.fetch = originalFetch;
  clearSyncedPricing();
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("AP-ISS-0103 priced one-second WAV records call, usage, durable cost and matching header", async () => {
  const caller = await createCaller();
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    assert.equal(String(url), "http://localhost:19431/v1/audio/transcriptions");
    return Response.json({ text: "one second" }, { status: 200 });
  }) as typeof fetch;

  const response = await route.POST(
    transcriptionRequest("telemetrystta/whisper-priced", makePcmWav(1), caller.key)
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-AgentProxy-Response-Cost"), "0.0100000000");
  await settleWrites();

  const callRows = rows(
    "SELECT status, provider, model, duration, request_type, request_summary, api_key_id FROM call_logs WHERE api_key_id = ?",
    caller.id
  );
  assert.equal(callRows.length, 1);
  assert.equal(callRows[0].status, 200);
  assert.equal(callRows[0].provider, "telemetrystta");
  assert.equal(callRows[0].model, "whisper-priced");
  assert.equal(callRows[0].request_type, "audio_transcription");
  assert.match(String(callRows[0].request_summary), /audioDurationSeconds.*1/);
  assert.ok(Number(callRows[0].duration) >= 0, "duration remains request latency in milliseconds");

  const usageRows = rows(
    "SELECT provider, model, status, success, endpoint, api_key_id FROM usage_history WHERE api_key_id = ?",
    caller.id
  );
  assert.equal(usageRows.length, 1);
  assert.equal(usageRows[0].provider, "telemetrystta");
  assert.equal(usageRows[0].model, "whisper-priced");
  assert.equal(usageRows[0].status, "200");
  assert.equal(usageRows[0].success, 1);
  assert.equal(usageRows[0].endpoint, "/v1/audio/transcriptions");

  const costRows = rows(
    "SELECT cost FROM domain_cost_history WHERE api_key_id = ? ORDER BY id",
    caller.id
  );
  assert.deepEqual(costRows.map((row) => Number(row.cost)), [0.01]);
});

test("AP-ISS-0103 malformed/unknown audio falls back to zero cost without losing telemetry", async () => {
  const caller = await createCaller();
  globalThis.fetch = (async () => Response.json({ text: "unknown duration" }, { status: 200 })) as typeof fetch;

  const response = await route.POST(
    transcriptionRequest(
      "telemetrystta/whisper-priced",
      new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/wav" }),
      caller.key
    )
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-AgentProxy-Response-Cost"), "0.0000000000");
  await settleWrites();

  assert.equal(rows("SELECT id FROM call_logs WHERE api_key_id = ?", caller.id).length, 1);
  assert.equal(rows("SELECT id FROM usage_history WHERE api_key_id = ?", caller.id).length, 1);
  assert.equal(rows("SELECT id FROM domain_cost_history WHERE api_key_id = ?", caller.id).length, 0);
});

test("AP-ISS-0103 upstream failure records failed call and usage without billing", async () => {
  const caller = await createCaller();
  globalThis.fetch = (async () => new Response("provider unavailable", { status: 503 })) as typeof fetch;

  const response = await route.POST(
    transcriptionRequest("telemetrystta/whisper-priced", makePcmWav(1), caller.key)
  );
  assert.equal(response.status, 503);
  await settleWrites();

  const callRows = rows("SELECT status, error_summary FROM call_logs WHERE api_key_id = ?", caller.id);
  assert.equal(callRows.length, 1);
  assert.equal(callRows[0].status, 503);
  const usageRows = rows(
    "SELECT status, success, error_code FROM usage_history WHERE api_key_id = ?",
    caller.id
  );
  assert.equal(usageRows.length, 1);
  assert.equal(usageRows[0].status, "503");
  assert.equal(usageRows[0].success, 0);
  assert.equal(usageRows[0].error_code, "503");
  assert.equal(rows("SELECT id FROM domain_cost_history WHERE api_key_id = ?", caller.id).length, 0);
});

test("AP-ISS-0103 noLog caller persists row telemetry but no request detail or summary", async () => {
  const caller = await createCaller(true);
  globalThis.fetch = (async () => Response.json({ text: "private" }, { status: 200 })) as typeof fetch;

  const response = await route.POST(
    transcriptionRequest("telemetrystta/whisper-priced", makePcmWav(1), caller.key)
  );
  assert.equal(response.status, 200);
  await settleWrites();

  const callRows = rows(
    "SELECT detail_state, has_request_body, request_summary FROM call_logs WHERE api_key_id = ?",
    caller.id
  );
  assert.equal(callRows.length, 1);
  assert.equal(callRows[0].detail_state, "none");
  assert.equal(callRows[0].has_request_body, 0);
  assert.equal(callRows[0].request_summary, null);
  assert.equal(rows("SELECT id FROM usage_history WHERE api_key_id = ?", caller.id).length, 1);
});

test("AP-ISS-0103 combo fallback records one row per attempt and bills only final success", async () => {
  const caller = await createCaller();
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    const value = String(url);
    if (value === "http://localhost:19431/v1/audio/transcriptions") {
      return new Response("first failed", { status: 503 });
    }
    if (value === "http://localhost:19432/v1/audio/transcriptions") {
      return Response.json({ text: "fallback success" }, { status: 200 });
    }
    throw new Error(`Unexpected URL: ${value}`);
  }) as typeof fetch;

  const response = await route.POST(
    transcriptionRequest("audio-telemetry-combo", makePcmWav(1), caller.key)
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-AgentProxy-Response-Cost"), "0.0200000000");
  await settleWrites();

  const callRows = rows(
    "SELECT provider, status FROM call_logs WHERE api_key_id = ?",
    caller.id
  );
  assert.equal(callRows.length, 3, "one call-log row per actual provider attempt, no duplicate final row");
  assert.equal(
    callRows.filter((row) => row.provider === "telemetrystta" && row.status === 503).length,
    2,
    "the combo retry is a second failed provider attempt and must be observable"
  );
  assert.equal(
    callRows.filter((row) => row.provider === "telemetrysttb" && row.status === 200).length,
    1,
    "only the final successful provider attempt should succeed"
  );
  assert.equal(rows("SELECT id FROM usage_history WHERE api_key_id = ?", caller.id).length, 3);
  const costRows = rows("SELECT cost FROM domain_cost_history WHERE api_key_id = ?", caller.id);
  assert.deepEqual(costRows.map((row) => Number(row.cost)), [0.02]);
});
