import test from "node:test";
import assert from "node:assert/strict";

const tokenRefresh = await import("../../open-sse/services/tokenRefresh.ts");
const { PROVIDERS } = await import("../../open-sse/config/constants.ts");

const { refreshClaudeOAuthToken, isUnrecoverableRefreshError, getAccessToken, refreshWithRetry } =
  tokenRefresh;

type LogLevel = "debug" | "info" | "warn" | "error";
type LogEntry = {
  level: LogLevel;
  scope: unknown;
  message: unknown;
  meta: unknown;
};
type MockLogger = {
  entries: LogEntry[];
  debug: (...args: [unknown?, unknown?, unknown?]) => void;
  info: (...args: [unknown?, unknown?, unknown?]) => void;
  warn: (...args: [unknown?, unknown?, unknown?]) => void;
  error: (...args: [unknown?, unknown?, unknown?]) => void;
};

type TestFetch = typeof fetch;
type FastSetTimeout = typeof globalThis.setTimeout & {
  __promisify__?: typeof globalThis.setTimeout.__promisify__;
};

function createLog(): MockLogger {
  const entries: LogEntry[] = [];
  const push = (level: LogLevel, args: [unknown?, unknown?, unknown?]) => {
    const [scope, message, meta] = args;
    entries.push({ level, scope, message, meta });
  };

  return {
    entries,
    debug: (...args) => push("debug", args),
    info: (...args) => push("info", args),
    warn: (...args) => push("warn", args),
    error: (...args) => push("error", args),
  };
}

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function withMockedFetch<TResult>(fetchImpl: TestFetch, fn: () => Promise<TResult>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function withPatchedProperties<TResult>(
  target: object,
  patch: Record<string, unknown>,
  fn: () => Promise<TResult>
) {
  const previous = new Map<string, unknown>();
  const targetRecord = target as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    previous.set(
      key,
      Object.prototype.hasOwnProperty.call(targetRecord, key) ? targetRecord[key] : undefined
    );
    targetRecord[key] = value;
  }

  try {
    return await fn();
  } finally {
    for (const [key] of Object.entries(patch)) {
      const prior = previous.get(key);
      if (prior === undefined) {
        delete targetRecord[key];
      } else {
        targetRecord[key] = prior;
      }
    }
  }
}

test("getAccessToken per-connection mutex: mutex cleared after success, next call re-fires upstream", async () => {
  const log = createLog();
  let upstreamCallCount = 0;

  // The rotation map (added for the codex-multi-auth pattern) is process-wide
  // and intentionally redirects a stale-token caller to the cached rotated
  // tokens. Clear it BEFORE and BETWEEN calls so this test exercises the
  // lower-level mutex semantics it was designed for.
  tokenRefresh._clearTokenRotationMap();

  await withPatchedProperties(
    PROVIDERS,
    { "custom-oauth-conn-mutex": { tokenUrl: "https://auth.example.com/token" } },
    async () => {
      await withMockedFetch(
        async () => {
          upstreamCallCount++;
          return jsonResponse({
            access_token: `access-${upstreamCallCount}`,
            refresh_token: `refresh-${upstreamCallCount}`,
            expires_in: 600,
          });
        },
        async () => {
          const credentials = { connectionId: "conn-refire", refreshToken: "rt" };

          const first = await getAccessToken("custom-oauth-conn-mutex", { ...credentials }, log);
          tokenRefresh._clearTokenRotationMap();
          const second = await getAccessToken("custom-oauth-conn-mutex", { ...credentials }, log);

          assert.equal(upstreamCallCount, 2, "each sequential call fires upstream once");
          assert.equal(first?.accessToken, "access-1");
          assert.equal(second?.accessToken, "access-2");
        }
      );
    }
  );
});

// ─── Unrecoverable error bail-out tests ──────────────────────────────────────

test("refreshWithRetry bails immediately on unrecoverable error without retrying", async () => {
  const provider = `bail-unrecoverable-${Date.now()}`;
  const log = createLog();
  let callCount = 0;

  const result = await refreshWithRetry(
    async () => {
      callCount++;
      return { error: "unrecoverable_refresh_error", code: "http_400" };
    },
    3,
    log,
    provider
  );

  assert.equal(callCount, 1, "should only call refreshFn once (no retries)");
  assert.deepEqual(result, { error: "unrecoverable_refresh_error", code: "http_400" });
  const warnMessages = log.entries.filter((e) => e.level === "warn").map((e) => e.message);
  assert.ok(
    warnMessages.some((m) => String(m).includes("Unrecoverable")),
    "should log an unrecoverable warning"
  );
});

test("refreshWithRetry bails immediately on invalid_grant error without retrying", async () => {
  const provider = `bail-invalid-grant-${Date.now()}`;
  const log = createLog();
  let callCount = 0;

  const result = await refreshWithRetry(
    async () => {
      callCount++;
      return { error: "invalid_grant", code: "http_400" };
    },
    3,
    log,
    provider
  );

  assert.equal(callCount, 1, "should only call refreshFn once (no retries)");
  assert.deepEqual(result, { error: "invalid_grant", code: "http_400" });
});

test("refreshClaudeOAuthToken returns error object for invalid_grant (expired refresh token)", async () => {
  const log = createLog();

  await withMockedFetch(
    async () =>
      new Response(JSON.stringify({ error: "invalid_grant", error_description: "Token expired" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    async () => {
      const result = await refreshClaudeOAuthToken("expired-token", log);
      assert.ok(result && typeof result === "object", "should return error object, not null");
      // Normalized to unrecoverable_refresh_error sentinel (Fix 6)
      assert.equal((result as any).error, "unrecoverable_refresh_error");
      assert.equal((result as any).code, "invalid_grant");
      assert.ok(isUnrecoverableRefreshError(result), "should be detected as unrecoverable");
    }
  );
});

test("refreshClaudeOAuthToken returns null for transient server errors (not unrecoverable)", async () => {
  const log = createLog();

  await withMockedFetch(
    async () =>
      new Response(JSON.stringify({ error: "server_error" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    async () => {
      const result = await refreshClaudeOAuthToken("some-token", log);
      assert.equal(result, null, "transient server errors should return null (retryable)");
    }
  );
});
