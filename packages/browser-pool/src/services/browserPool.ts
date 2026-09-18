/**
 * browserPool.ts — Shared stealth browser pool for web-cookie providers.
 *
 * The DuckDuckGo VQD challenge and Claude web's Cloudflare Turnstile both
 * validate values that only a real browser can produce (DOM layout
 * measurements like offsetWidth/Height, getBoundingClientRect,
 * getComputedStyle, iframe contentWindow probes). Plain Node fetch + a
 * VM-stubs solver structurally runs the JS but cannot match those values,
 * so the server rejects the request.
 *
 * This pool keeps one Chromium instance warm and serves "browser contexts"
 * (one per provider) on demand. Each context owns one or more pages; the
 * caller is expected to be polite (one page per request, close on done).
 *
 * The pool prefers `cloakbrowser` (npm) when available — its binary-level
 * fingerprint patches (--fingerprint-timezone, --fingerprint-locale, and
 * dozens more) are the only thing that gets past DuckDuckGo's anti-bot
 * in this environment. Falls back to plain `playwright` if cloakbrowser
 * is not installed; the fallback works for Claude web (which only needs
 * valid cookies) but not for DDG's VQD challenge.
 *
 * Opt-in: pool only launches Chromium when an executor explicitly asks
 * for a context, so users who never use the browser-backed path pay zero
 * startup cost. Set AGENTPROXY_BROWSER_POOL=off to fully disable.
 */

import { Buffer } from "node:buffer";
import type {
  BrowserPoolContextOptions,
  BrowserPoolMetrics,
  PooledContext,
} from "../interfaces.ts";

type Browser = import("playwright").Browser;
type BrowserContext = import("playwright").BrowserContext;
type Page = import("playwright").Page;

/** Proxy resolver injected by the core stub after dynamic import. */
type ProxyResolverFn = (
  providerKey: string
) => Promise<import("playwright").LaunchOptions["proxy"] | undefined>;

let injectedProxyResolver: ProxyResolverFn | null = null;

export function setProxyResolver(fn: ProxyResolverFn): void {
  injectedProxyResolver = fn;
}

function createBrowserPoolMetrics(): BrowserPoolMetrics {
  return {
    browserLaunches: 0,
    browserLaunchFailures: 0,
    contextsCreated: 0,
    contextsReused: 0,
    contextsEvicted: 0,
    contextsReleased: 0,
    contextCreateFailures: 0,
    shutdowns: 0,
    lastShutdownReason: null,
  };
}

interface PoolState {
  browser: Browser | null;
  contexts: Map<string, PooledContext>;
  pendingContexts: Map<string, Promise<PooledContext>>;
  launching: Promise<Browser> | null;
  lastActivity: number;
  idleTimer: NodeJS.Timeout | null;
  evictTimer: NodeJS.Timeout | null;
  cloakLaunch: ((opts: unknown) => Promise<Browser>) | null;
  cloakLaunchResolved: boolean;
  metrics: BrowserPoolMetrics;
}

const POOL_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const CONTEXT_TTL_MS = 10 * 60 * 1000; // 10 min — evict stale contexts
const EVICT_INTERVAL_MS = 60 * 1000; // check every 60s
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

const state: PoolState = {
  browser: null,
  contexts: new Map(),
  pendingContexts: new Map(),
  launching: null,
  lastActivity: 0,
  idleTimer: null,
  evictTimer: null,
  cloakLaunch: null,
  cloakLaunchResolved: false,
  metrics: createBrowserPoolMetrics(),
};

function getCloakbrowserModuleId(): string {
  // Keep this computed: cloakbrowser is an optional runtime enhancer, and a literal
  // dynamic import with the package name makes Turbopack resolve it during route compilation.
  return ["cloak", "browser"].join("");
}

async function resolveCloakLaunch(): Promise<((opts: unknown) => Promise<Browser>) | null> {
  if (state.cloakLaunchResolved) return state.cloakLaunch;
  state.cloakLaunchResolved = true;
  try {
    const mod = (await import(
      /* webpackIgnore: true */
      getCloakbrowserModuleId()
    )) as unknown as {
      launch?: (opts: unknown) => Promise<Browser>;
    };
    state.cloakLaunch = mod.launch ?? null;
  } catch {
    state.cloakLaunch = null;
  }
  return state.cloakLaunch;
}

function isPoolEnabled(): boolean {
  const flag = process.env.AGENTPROXY_BROWSER_POOL;
  if (flag === undefined) return true;
  return flag !== "off" && flag !== "0" && flag !== "false";
}

function resetIdleTimer(): void {
  if (state.idleTimer) clearTimeout(state.idleTimer);
  state.idleTimer = setTimeout(() => {
    void shutdownPool("idle-timeout");
  }, POOL_IDLE_TIMEOUT_MS);
  state.idleTimer.unref?.();
}

function evictStaleContexts(): void {
  const now = Date.now();
  for (const [key, pooled] of state.contexts) {
    if (now - pooled.lastUsed > CONTEXT_TTL_MS) {
      console.log(
        "[BrowserPool] Evicted stale context:",
        key,
        "(idle",
        ((now - pooled.lastUsed) / 1000).toFixed(0) + "s)"
      );
      state.contexts.delete(key);
      state.metrics.contextsEvicted++;
      pooled.context.close().catch(() => {});
    }
  }
  if (state.contexts.size === 0 && !state.launching) {
    void shutdownPool("all-contexts-evicted");
  }
}

function startEvictTimer(): void {
  if (state.evictTimer) clearInterval(state.evictTimer);
  state.evictTimer = setInterval(() => evictStaleContexts(), EVICT_INTERVAL_MS);
  state.evictTimer.unref?.();
}

export function resolveBrowserLaunchSecurity(effectiveUid?: number): {
  chromiumSandbox: true;
  args: string[];
} {
  const uid = effectiveUid ?? (typeof process.getuid === "function" ? process.getuid() : undefined);
  if (uid === 0) {
    throw new Error(
      "Browser pool refuses to launch Chromium as root. Run AgentProxy as a non-root user so Chromium sandboxing can remain enabled."
    );
  }
  return {
    chromiumSandbox: true,
    args: ["--disable-dev-shm-usage"],
  };
}

async function launchBrowser(): Promise<Browser> {
  if (state.browser) return state.browser;
  if (state.launching) return state.launching;
  state.launching = (async () => {
    const launchSecurity = resolveBrowserLaunchSecurity();
    const cloakLaunch = await resolveCloakLaunch();
    let browser: Browser;
    if (cloakLaunch) {
      browser = await cloakLaunch({
        headless: true,
        chromiumSandbox: launchSecurity.chromiumSandbox,
        args: launchSecurity.args,
      });
    } else {
      // Fallback: plain Playwright. Works for Claude web (cookie-only
      // auth) but DDG's VQD challenge will detect this Chromium build.
      const { chromium } = await import("playwright");
      browser = await chromium.launch({
        headless: true,
        chromiumSandbox: launchSecurity.chromiumSandbox,
        args: [...launchSecurity.args, "--disable-blink-features=AutomationControlled"],
      });
    }
    state.browser = browser;
    state.launching = null;
    state.metrics.browserLaunches++;
    return browser;
  })();
  try {
    return await state.launching;
  } catch (err) {
    state.launching = null;
    state.metrics.browserLaunchFailures++;
    throw err;
  }
}

function parseCookieString(
  raw: string,
  domain: string
): Array<{
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Lax" | "Strict" | "None";
}> {
  return raw
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf("=");
      if (eq < 0) return null;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (!name || !value) return null;
      return {
        name,
        value,
        domain: domain.startsWith(".") ? domain : `.${domain}`,
        path: "/",
        expires: -1,
        httpOnly: false,
        secure: true,
        sameSite: "Lax" as const,
      };
    })
    .filter(Boolean) as Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Lax" | "Strict" | "None";
  }>;
}

// Clear a key from the pending-creation map once its promise settles, counting
// failures. Kept as a leaf helper so acquireBrowserContext stays under the
// function-length ceiling (#3368 PR7 metrics).
function settlePendingContext(key: string, failed: boolean): void {
  if (failed) state.metrics.contextCreateFailures++;
  state.pendingContexts.delete(key);
}

export async function acquireBrowserContext(
  key: string,
  options: BrowserPoolContextOptions
): Promise<PooledContext> {
  if (!isPoolEnabled()) {
    throw new Error(
      "browserPool: AGENTPROXY_BROWSER_POOL=off — context requested but pool is disabled"
    );
  }
  const existing = state.contexts.get(key);
  if (existing) {
    existing.lastUsed = Date.now();
    state.lastActivity = Date.now();
    state.metrics.contextsReused++;
    resetIdleTimer();
    return existing;
  }

  // Dedup concurrent creations for the same key
  const pending = state.pendingContexts.get(key);
  if (pending) return pending;

  const createPromise = (async (): Promise<PooledContext> => {
    const proxy = injectedProxyResolver ? await injectedProxyResolver(key) : undefined;
    const [browser] = await Promise.all([launchBrowser()]);
    const isStealth = state.cloakLaunch !== null;
    const context = await browser.newContext({
      userAgent: options.userAgent || DEFAULT_USER_AGENT,
      locale: options.locale || "en-US",
      timezoneId: options.timezone || "America/New_York",
      viewport: { width: 1280, height: 800 },
      ...(options.storageState ? { storageState: options.storageState } : {}),
      ...(proxy ? { proxy } : {}),
    });

    if (options.cookieString) {
      const cookies = parseCookieString(options.cookieString, options.cookieDomain);
      if (cookies.length > 0) {
        await context.addCookies(cookies);
      }
    }

    let warmupPage: Page | null = null;
    if (options.warmupUrl) {
      try {
        warmupPage = await context.newPage();
        await warmupPage.goto(options.warmupUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        // Give the warmup a moment for the upstream's status/auth/country
        // JSON endpoints to fire. Without this, the first chat request would
        // pay the warmup cost on the hot path.
        await new Promise((r) => setTimeout(r, 1500));
      } catch (err) {
        try {
          await warmupPage?.close();
        } catch {
          /* ignore */
        }
        warmupPage = null;
        void err;
      }
    }

    // Guard: if shutdownPool() ran while we were creating this context,
    // the browser we obtained is now closed. Close our temp context and
    // throw so the caller knows to retry.
    if (state.browser !== browser) {
      await context.close().catch(() => {});
      if (warmupPage) {
        await warmupPage.close().catch(() => {});
      }
      throw new Error("Pool shut down during context creation");
    }

    const pooled: PooledContext = {
      id: key,
      context,
      warmupPage,
      lastUsed: Date.now(),
      isStealth,
    };
    state.contexts.set(key, pooled);
    state.metrics.contextsCreated++;
    state.lastActivity = Date.now();
    resetIdleTimer();
    startEvictTimer();
    return pooled;
  })();

  state.pendingContexts.set(key, createPromise);
  createPromise
    .then(() => settlePendingContext(key, false))
    .catch(() => settlePendingContext(key, true));

  return createPromise;
}

export async function openPage(pooled: PooledContext): Promise<Page> {
  return pooled.context.newPage();
}

export async function releaseBrowserContext(key: string): Promise<void> {
  const pooled = state.contexts.get(key);
  if (!pooled) return;
  state.contexts.delete(key);
  state.metrics.contextsReleased++;
  try {
    await pooled.context.close();
  } catch {
    /* ignore */
  }
  if (state.contexts.size === 0) {
    await shutdownPool("last-context-closed");
  }
}

export async function shutdownPool(reason: string): Promise<void> {
  state.metrics.shutdowns++;
  state.metrics.lastShutdownReason = reason;
  if (state.idleTimer) {
    clearTimeout(state.idleTimer);
    state.idleTimer = null;
  }
  if (state.evictTimer) {
    clearInterval(state.evictTimer);
    state.evictTimer = null;
  }
  state.pendingContexts.clear();
  for (const [key, pooled] of state.contexts) {
    try {
      await pooled.context.close();
    } catch {
      /* ignore */
    }
    state.contexts.delete(key);
  }
  if (state.browser) {
    try {
      await state.browser.close();
    } catch {
      /* ignore */
    }
    state.browser = null;
  }
  state.lastActivity = Date.now();
  // Avoid unused-parameter lint: log reason via debug if anyone hooks
  // process.on('exit') and prints state.
  void reason;
}

function getBrowserPoolStatus(): {
  enabled: boolean;
  contexts: number;
  browserRunning: boolean;
  stealthAvailable: boolean;
  lastActivityAgoMs: number;
} {
  return {
    enabled: isPoolEnabled(),
    contexts: state.contexts.size,
    browserRunning: state.browser !== null,
    stealthAvailable: state.cloakLaunch !== null,
    lastActivityAgoMs: state.lastActivity === 0 ? -1 : Date.now() - state.lastActivity,
  };
}

/**
 * #3368 PR7 — browser-pool observability. Returns live status plus cumulative
 * lifecycle telemetry (launches, context create/reuse/evict/release counts,
 * failures, shutdowns). Surfaced via the agentproxy_browser_pool_status MCP tool.
 */
export function getBrowserPoolMetrics(): {
  status: ReturnType<typeof getBrowserPoolStatus>;
  metrics: BrowserPoolMetrics;
} {
  return { status: getBrowserPoolStatus(), metrics: { ...state.metrics } };
}

/** Test-only: reset cumulative metrics so assertions start from a clean slate. */
export function __resetBrowserPoolMetricsForTest(): void {
  state.metrics = createBrowserPoolMetrics();
}

export async function readPageResponseBody(
  response: import("playwright").Response
): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(response.headers())) {
    headers[name] = value;
  }
  const body = await response.body();
  return { status: response.status(), headers, body: Buffer.from(body) };
}

export interface BoundedPageResponseCaptureResult {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  tooLarge: boolean;
}

export interface BoundedPageResponseCapture {
  result: Promise<BoundedPageResponseCaptureResult>;
  dispose: () => Promise<void>;
}

const BOUNDED_RESPONSE_READ_CHUNK_BYTES = 64 * 1024;

type BoundedCdpPausedResponse = {
  requestId: string;
  request: { url: string; method: string };
  responseStatusCode?: number;
  responseStatusText?: string;
  responseErrorReason?: string;
  responseHeaders?: Array<{ name: string; value: string }>;
};

function responseHeadersToRecord(
  entries: Array<{ name: string; value: string }>
): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const { name, value } of entries) headers[name.toLowerCase()] = value;
  return headers;
}

function responseHeadersForFulfill(
  entries: Array<{ name: string; value: string }>,
  bodyLength: number
): Array<{ name: string; value: string }> {
  const filtered = entries.filter(({ name }) => {
    const normalized = name.toLowerCase();
    return (
      normalized !== "content-length" &&
      normalized !== "content-encoding" &&
      normalized !== "transfer-encoding"
    );
  });
  filtered.push({ name: "content-length", value: String(bodyLength) });
  return filtered;
}

function decodeCdpStreamChunk(data: string, base64Encoded?: boolean): Buffer {
  return Buffer.from(data, base64Encoded ? "base64" : "utf8");
}

function cdpStreamChunkByteLength(data: string, base64Encoded?: boolean): number {
  return Buffer.byteLength(data, base64Encoded ? "base64" : "utf8");
}

/**
 * Capture one matching page response without ever calling Playwright response.body().
 * Chromium Fetch interception pauses matching response bodies after headers; the body is
 * read in bounded CDP IO chunks, then either fulfilled back to the page or cancelled once
 * the byte cap would be exceeded. Unrelated responses are continued immediately.
 */
export async function startBoundedPageResponseCapture(
  page: Page,
  matches: (url: string, method: string) => boolean,
  maxBytes: number,
  options: { timeoutMs?: number; signal?: AbortSignal | null } = {}
): Promise<BoundedPageResponseCapture> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError("maxBytes must be a non-negative safe integer");
  }

  const timeoutMs = options.timeoutMs ?? 30000;
  const session = await page.context().newCDPSession(page);
  let settled = false;
  let targetRequestId: string | null = null;
  let streamHandle: string | null = null;
  let timeout: NodeJS.Timeout | null = null;
  let abortListener: (() => void) | null = null;
  let resolveResult!: (value: BoundedPageResponseCaptureResult) => void;
  let rejectResult!: (reason: unknown) => void;
  const result = new Promise<BoundedPageResponseCaptureResult>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const cleanup = async (): Promise<void> => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    if (abortListener && options.signal) {
      options.signal.removeEventListener("abort", abortListener);
      abortListener = null;
    }
    session.off("Fetch.requestPaused", onRequestPaused);
    if (streamHandle) {
      const handle = streamHandle;
      streamHandle = null;
      await session.send("IO.close", { handle }).catch(() => {});
    }
    await session.send("Fetch.disable").catch(() => {});
    await session.detach().catch(() => {});
  };

  const resolveCapture = async (value: BoundedPageResponseCaptureResult): Promise<void> => {
    if (settled) return;
    settled = true;
    await cleanup();
    resolveResult(value);
  };

  const rejectCapture = async (reason: unknown): Promise<void> => {
    if (settled) return;
    settled = true;
    if (targetRequestId) {
      await session
        .send("Fetch.failRequest", { requestId: targetRequestId, errorReason: "Aborted" })
        .catch(() => {});
    }
    await cleanup();
    rejectResult(reason);
  };

  const cancelAsTooLarge = async (
    requestId: string,
    status: number,
    headers: Record<string, string>
  ): Promise<void> => {
    await session.send("Fetch.failRequest", { requestId, errorReason: "Aborted" }).catch(() => {});
    await resolveCapture({ status, headers, body: Buffer.alloc(0), tooLarge: true });
  };

  const readTargetResponse = async (
    requestId: string,
    status: number,
    responsePhrase: string | undefined,
    headerEntries: Array<{ name: string; value: string }>
  ): Promise<void> => {
    const headers = responseHeadersToRecord(headerEntries);
    const declaredLength = Number.parseInt(headers["content-length"] ?? "", 10);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      await cancelAsTooLarge(requestId, status, headers);
      return;
    }

    const stream = await session.send("Fetch.takeResponseBodyAsStream", { requestId });
    streamHandle = stream.stream;
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    while (!settled) {
      const chunk = await session.send("IO.read", {
        handle: stream.stream,
        size: BOUNDED_RESPONSE_READ_CHUNK_BYTES,
      });
      if (chunk.data) {
        const chunkBytes = cdpStreamChunkByteLength(chunk.data, chunk.base64Encoded);
        if (totalBytes + chunkBytes > maxBytes) {
          await cancelAsTooLarge(requestId, status, headers);
          return;
        }
        chunks.push(decodeCdpStreamChunk(chunk.data, chunk.base64Encoded));
        totalBytes += chunkBytes;
      }
      if (chunk.eof) break;
    }
    if (settled) return;

    const body = Buffer.concat(chunks, totalBytes);
    await session.send("Fetch.fulfillRequest", {
      requestId,
      responseCode: status,
      responsePhrase,
      responseHeaders: responseHeadersForFulfill(headerEntries, body.length),
      body: body.toString("base64"),
    });
    await resolveCapture({ status, headers, body, tooLarge: false });
  };

  const onRequestPaused = (event: BoundedCdpPausedResponse) => {
    void (async () => {
      const isResponseStage =
        event.responseStatusCode !== undefined || event.responseErrorReason !== undefined;
      if (!isResponseStage) {
        await session.send("Fetch.continueRequest", { requestId: event.requestId });
        return;
      }

      if (targetRequestId || !matches(event.request.url, event.request.method)) {
        await session.send("Fetch.continueResponse", { requestId: event.requestId });
        return;
      }

      targetRequestId = event.requestId;
      if (event.responseStatusCode === undefined) {
        await rejectCapture(
          new Error(
            `Browser response failed before headers: ${event.responseErrorReason ?? "unknown"}`
          )
        );
        return;
      }

      await readTargetResponse(
        event.requestId,
        event.responseStatusCode,
        event.responseStatusText,
        event.responseHeaders ?? []
      );
    })().catch((error) => {
      void rejectCapture(error);
    });
  };

  session.on("Fetch.requestPaused", onRequestPaused);
  try {
    await session.send("Fetch.enable", {
      patterns: [{ urlPattern: "*", requestStage: "Response" }],
    });
  } catch (error) {
    session.off("Fetch.requestPaused", onRequestPaused);
    await session.detach().catch(() => {});
    throw error;
  }

  timeout = setTimeout(() => {
    void rejectCapture(new Error("Timed out waiting for bounded browser response"));
  }, timeoutMs);
  timeout.unref?.();

  if (options.signal) {
    abortListener = () => {
      void rejectCapture(new DOMException("Aborted", "AbortError"));
    };
    if (options.signal.aborted) abortListener();
    else options.signal.addEventListener("abort", abortListener, { once: true });
  }

  return {
    result,
    dispose: async () => {
      if (settled) return;
      await rejectCapture(new DOMException("Aborted", "AbortError"));
      await result.catch(() => {});
    },
  };
}
