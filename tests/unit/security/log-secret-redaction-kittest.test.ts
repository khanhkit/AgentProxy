import test, { after, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const LOG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-kittest-log-redaction-"));
const LOG_PATH = path.join(LOG_DIR, "app.log");
const originalLogPath = process.env.APP_LOG_FILE_PATH;
const originalLogToFile = process.env.APP_LOG_TO_FILE;

process.env.APP_LOG_FILE_PATH = LOG_PATH;
process.env.APP_LOG_TO_FILE = "true";

const { initConsoleInterceptor, __consoleInterceptorInternals } =
  await import("../../../src/lib/consoleInterceptor.ts");
const { toPublicSafeTunnelError } = await import("../../../src/lib/api/publicSafeTunnelError.ts");

const CANARIES = {
  bearer: "kittest-bearer-secret-4f93f32b",
  jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJraXR0ZXN0In0.KITTESTSIG4f93f32b",
  refresh: "kittest-refresh-secret-4f93f32b",
  tskey: "tskey-auth-kittest-4f93f32b",
  apiKey: "sk-kittest-api-secret-4f93f32b",
};

function clearLog(): void {
  __consoleInterceptorInternals.reset();
  if (fs.existsSync(LOG_PATH)) fs.writeFileSync(LOG_PATH, "", "utf8");
}

function readRaw(): string {
  return fs.existsSync(LOG_PATH) ? fs.readFileSync(LOG_PATH, "utf8") : "";
}

function readEntries(): Array<{ component?: string; message?: string; level?: string }> {
  return readRaw()
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as { component?: string; message?: string; level?: string });
}

function assertCanariesAbsent(text: string, names: Array<keyof typeof CANARIES> = Object.keys(CANARIES) as Array<keyof typeof CANARIES>): void {
  for (const name of names) {
    assert.equal(
      text.includes(CANARIES[name]),
      false,
      `secret canary ${name} persisted verbatim`
    );
  }
}

afterEach(() => {
  clearLog();
});

after(() => {
  __consoleInterceptorInternals.reset();
  if (originalLogPath === undefined) delete process.env.APP_LOG_FILE_PATH;
  else process.env.APP_LOG_FILE_PATH = originalLogPath;
  if (originalLogToFile === undefined) delete process.env.APP_LOG_TO_FILE;
  else process.env.APP_LOG_TO_FILE = originalLogToFile;
  fs.rmSync(LOG_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

test("TC-LOG-SEC-001 string credential canaries are absent from persisted logs", () => {
  clearLog();
  initConsoleInterceptor();

  console.error(`[KITTEST_LOG] Authorization: Bearer ${CANARIES.bearer}`);
  console.error(`[KITTEST_LOG] id_token=${CANARIES.jwt}`);
  console.error(`[KITTEST_LOG] refresh_token=${CANARIES.refresh}`);
  console.error(`[KITTEST_LOG] tailscale_key=${CANARIES.tskey}`);
  console.error(`[KITTEST_LOG] api_key=${CANARIES.apiKey}`);

  __consoleInterceptorInternals.reset();
  const raw = readRaw();
  assertCanariesAbsent(raw);
  assert.match(raw, /KITTEST_LOG/, "non-secret diagnostic context was lost");
});

test("TC-LOG-SEC-002 structured secret fields are redacted before persistence", () => {
  clearLog();
  initConsoleInterceptor();

  console.error("[KITTEST_STRUCT] provider failure", {
    provider: "synthetic-provider",
    attempt: 2,
    status: "retrying",
    authorization: `Bearer ${CANARIES.bearer}`,
    accessToken: CANARIES.jwt,
    refreshToken: CANARIES.refresh,
    nested: {
      apiKey: CANARIES.apiKey,
      token: CANARIES.tskey,
    },
  });

  __consoleInterceptorInternals.reset();
  const raw = readRaw();
  assertCanariesAbsent(raw);
  assert.match(raw, /synthetic-provider/, "provider diagnostic was lost");
  assert.match(raw, /retrying/, "status diagnostic was lost");
});

test("TC-LOG-SEC-003 Error message and stack credential canaries are redacted", () => {
  clearLog();
  initConsoleInterceptor();

  const err = new Error(
    `oauth refresh failed Authorization: Bearer ${CANARIES.bearer}; api_key=${CANARIES.apiKey}`
  );
  err.stack = `Error: oauth refresh failed\n    at syntheticRefresh (/tmp/kittest.ts:10:3)\n    credential ${CANARIES.tskey}\n    token ${CANARIES.jwt}`;
  console.error("[KITTEST_ERROR] provider refresh failed", err);

  __consoleInterceptorInternals.reset();
  const raw = readRaw();
  assertCanariesAbsent(raw, ["bearer", "apiKey", "tskey", "jwt"]);
  assert.match(raw, /provider refresh failed/, "error diagnostic context was lost");
  assert.match(raw, /syntheticRefresh/, "non-secret stack diagnostic was lost");
});

test("TC-LOG-SEC-004 public-safe tunnel body stays fixed while persisted operator error is redacted", () => {
  clearLog();
  initConsoleInterceptor();

  const fallback = "Unable to configure tunnel.";
  const body = toPublicSafeTunnelError(
    new Error(`invalid key ${CANARIES.tskey}; Authorization: Bearer ${CANARIES.bearer}`),
    fallback,
    "KITTEST_TUNNEL"
  );

  assert.deepEqual(body, { error: fallback, reason: "unknown" });
  const publicBody = JSON.stringify(body);
  assertCanariesAbsent(publicBody, ["tskey", "bearer"]);

  __consoleInterceptorInternals.reset();
  const raw = readRaw();
  assertCanariesAbsent(raw, ["tskey", "bearer"]);
  assert.match(raw, /KITTEST_TUNNEL/, "server-side operator context was lost");
});

test("TC-LOG-REG-005 non-secret component and printf diagnostics remain useful", () => {
  clearLog();
  initConsoleInterceptor();

  console.log("[INFO] [KITTEST_LOG] processed %d request(s) for %s", 3, "cliproxy");
  console.log("[KITTEST_LOG] state", { status: "ok", attempt: 2 });

  __consoleInterceptorInternals.reset();
  const entries = readEntries();
  const formatted = entries.find((entry) => entry.message?.includes("processed 3 request(s)"));
  assert.ok(formatted, "formatted diagnostic entry missing");
  assert.equal(formatted.component, "KITTEST_LOG");
  assert.equal(formatted.message, "[INFO] [KITTEST_LOG] processed 3 request(s) for cliproxy");

  const structured = entries.find((entry) => entry.message?.includes("\"status\":\"ok\""));
  assert.ok(structured, "ordinary structured diagnostic entry missing");
  assert.equal(structured.component, "KITTEST_LOG");
  assert.match(structured.message || "", /\"attempt\":2/);
});
