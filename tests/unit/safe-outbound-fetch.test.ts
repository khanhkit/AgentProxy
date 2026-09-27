import test from "node:test";
import assert from "node:assert/strict";

const { SafeOutboundFetchError, safeOutboundFetch } =
  await import("../../src/shared/network/safeOutboundFetch.ts");

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("safeOutboundFetch retries transient failures for idempotent methods", async () => {
  let attempts = 0;

  globalThis.fetch = async () => {
    attempts += 1;
    if (attempts === 1) {
      throw new Error("socket hang up");
    }

    return Response.json({ ok: true });
  };

  const response = await safeOutboundFetch("https://example.test/models", {
    method: "GET",
    timeoutMs: 100,
    retry: {
      attempts: 2,
      backoffMs: [0],
      methods: ["GET"],
    },
  });

  assert.equal(attempts, 2);
  assert.deepEqual(await response.json(), { ok: true });
});

test("safeOutboundFetch normalizes timeout failures", async () => {
  globalThis.fetch = async (_url, init = {}) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener(
        "abort",
        () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        },
        { once: true }
      );
    });

  await assert.rejects(
    safeOutboundFetch("https://example.test/slow", {
      method: "GET",
      timeoutMs: 5,
      retry: false,
    }),
    (error) => {
      assert.equal(error instanceof SafeOutboundFetchError, true);
      assert.equal((error as any).code, "TIMEOUT");
      (assert as any).equal((error as any).timeoutMs, 5);
      (assert as any).equal((error as any).url, "https://example.test/slow");
      return true;
    }
  );
});

test("safeOutboundFetch blocks redirects when allowRedirect is disabled", async () => {
  globalThis.fetch = async () =>
    new Response(null, {
      status: 302,
      headers: { location: "https://redirect.example.test/login" },
    });

  await assert.rejects(
    safeOutboundFetch("https://example.test/models", {
      method: "GET",
      timeoutMs: 25,
      retry: false,
    }),
    (error) => {
      assert.equal(error instanceof SafeOutboundFetchError, true);
      assert.equal((error as any).code, "REDIRECT_BLOCKED");
      assert.equal((error as any).status, 302);
      assert.equal((error as any).location, "https://redirect.example.test/login");
      return true;
    }
  );
});

test("safeOutboundFetch blocks private hosts when public-only guard is enabled", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return Response.json({ ok: true });
  };

  await assert.rejects(
    safeOutboundFetch("http://127.0.0.1:11434/models", {
      method: "GET",
      guard: "public-only",
      retry: false,
    }),
    (error) => {
      assert.equal(error instanceof SafeOutboundFetchError, true);
      assert.equal((error as any).code, "URL_GUARD_BLOCKED");
      assert.equal(called, false);
      return true;
    }
  );
});

test("AP-ISS-0026 guarded allowed redirect blocks a private destination before the next fetch", async () => {
  const calls: Array<{ url: string; redirect?: RequestRedirect }> = [];
  globalThis.fetch = async (input, init: RequestInit = {}) => {
    calls.push({ url: String(input), redirect: init.redirect });
    return new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1:8080/private" },
    });
  };

  await assert.rejects(
    safeOutboundFetch("https://public.example.test/start", {
      method: "GET",
      guard: "public-only",
      allowRedirect: true,
      retry: false,
    }),
    (error) => {
      assert.equal(error instanceof SafeOutboundFetchError, true);
      assert.equal((error as { code?: string }).code, "URL_GUARD_BLOCKED");
      return true;
    }
  );
  assert.deepEqual(calls, [{ url: "https://public.example.test/start", redirect: "manual" }]);
});

test("AP-ISS-0026 guarded allowed redirect blocks cloud metadata before the next fetch", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(null, {
      status: 307,
      headers: { location: "http://169.254.169.254/latest/meta-data" },
    });
  };

  await assert.rejects(
    safeOutboundFetch("https://public.example.test/start", {
      method: "GET",
      guard: "block-metadata",
      allowRedirect: true,
      retry: false,
    }),
    (error) => {
      assert.equal(error instanceof SafeOutboundFetchError, true);
      assert.equal((error as { code?: string }).code, "URL_GUARD_BLOCKED");
      return true;
    }
  );
  assert.equal(calls, 1);
});

test("AP-ISS-0026 guarded allowed redirect follows validated public and relative hops", async () => {
  const calls: Array<{ url: string; redirect?: RequestRedirect }> = [];
  globalThis.fetch = async (input, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, redirect: init.redirect });
    if (url === "https://public.example.test/start") {
      return new Response(null, { status: 302, headers: { location: "/next" } });
    }
    if (url === "https://public.example.test/next") {
      return Response.json({ ok: true });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const response = await safeOutboundFetch("https://public.example.test/start", {
    method: "GET",
    guard: "public-only",
    allowRedirect: true,
    retry: false,
  });
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(calls, [
    { url: "https://public.example.test/start", redirect: "manual" },
    { url: "https://public.example.test/next", redirect: "manual" },
  ]);
});

test("AP-ISS-0026 guarded redirect count is capped deterministically", async () => {
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    const index = Number(new URL(url).searchParams.get("hop") || "0");
    return new Response(null, {
      status: 302,
      headers: { location: `https://public.example.test/loop?hop=${index + 1}` },
    });
  };

  await assert.rejects(
    safeOutboundFetch("https://public.example.test/loop?hop=0", {
      method: "GET",
      guard: "public-only",
      allowRedirect: true,
      maxRedirects: 2,
      retry: false,
    }),
    (error) => {
      assert.equal(error instanceof SafeOutboundFetchError, true);
      assert.equal((error as { code?: string }).code, "REDIRECT_BLOCKED");
      assert.match((error as Error).message, /redirect.*limit/i);
      return true;
    }
  );
  assert.deepEqual(calls, [
    "https://public.example.test/loop?hop=0",
    "https://public.example.test/loop?hop=1",
    "https://public.example.test/loop?hop=2",
  ]);
});

test("AP-ISS-0026 guard none keeps native redirect-follow compatibility", async () => {
  let seenRedirect: RequestRedirect | undefined;
  globalThis.fetch = async (_input, init: RequestInit = {}) => {
    seenRedirect = init.redirect;
    return Response.json({ ok: true });
  };

  const response = await safeOutboundFetch("https://example.test/start", {
    guard: "none",
    allowRedirect: true,
    retry: false,
  });
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(seenRedirect, "follow");
});

test("AP-ISS-0026 guarded 302 preserves native POST-to-GET redirect semantics", async () => {
  const calls: Array<{ url: string; method?: string; body?: BodyInit | null; headers: Headers }> =
    [];
  globalThis.fetch = async (input, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({
      url,
      method: init.method,
      body: init.body,
      headers: new Headers(init.headers),
    });
    if (calls.length === 1) {
      return new Response(null, { status: 302, headers: { location: "/after" } });
    }
    return Response.json({ ok: true });
  };

  const response = await safeOutboundFetch("https://public.example.test/start", {
    method: "POST",
    headers: { "content-type": "application/json", "x-test": "kept" },
    body: JSON.stringify({ hello: "world" }),
    guard: "public-only",
    allowRedirect: true,
    retry: false,
  });
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[1].method, "GET");
  assert.equal(calls[1].body, undefined);
  assert.equal(calls[1].headers.has("content-type"), false);
  assert.equal(calls[1].headers.get("x-test"), "kept");
});

test("AP-ISS-0026 guarded cross-origin redirect strips sensitive credentials", async () => {
  const calls: Array<{ url: string; headers: Headers }> = [];
  globalThis.fetch = async (input, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, headers: new Headers(init.headers) });
    if (calls.length === 1) {
      return new Response(null, {
        status: 307,
        headers: { location: "https://other-public.example.test/next" },
      });
    }
    return Response.json({ ok: true });
  };

  const response = await safeOutboundFetch("https://public.example.test/start", {
    method: "GET",
    headers: {
      authorization: "Bearer secret",
      cookie: "sid=secret",
      "proxy-authorization": "Basic secret",
      "x-safe": "keep-me",
    },
    guard: "public-only",
    allowRedirect: true,
    retry: false,
  });
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(calls[1].headers.has("authorization"), false);
  assert.equal(calls[1].headers.has("cookie"), false);
  assert.equal(calls[1].headers.has("proxy-authorization"), false);
  assert.equal(calls[1].headers.get("x-safe"), "keep-me");
});

test("AP-ISS-0026 malformed redirect location is normalized as INVALID_URL", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(null, { status: 302, headers: { location: "http://[" } });
  };

  await assert.rejects(
    safeOutboundFetch("https://public.example.test/start", {
      guard: "public-only",
      allowRedirect: true,
      retry: false,
    }),
    (error) => {
      assert.equal(error instanceof SafeOutboundFetchError, true);
      assert.equal((error as { code?: string }).code, "INVALID_URL");
      return true;
    }
  );
  assert.equal(calls, 1);
});
