import assert from "node:assert/strict";
import test from "node:test";

import { deliverWebhook, type WebhookPayload } from "../../../src/lib/webhookDispatcher.ts";

const payload: WebhookPayload = {
  event: "request.completed",
  timestamp: "2026-09-16T00:00:00.000Z",
  data: { requestId: "req-test" },
};

interface FetchCall {
  url: string;
  redirect: RequestRedirect | undefined;
  signature: string | null;
}

function installRedirectFixture(target: string, status: 307 | 308 = 307) {
  const originalFetch = globalThis.fetch;
  const calls: FetchCall[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const headers = new Headers(init?.headers);
    calls.push({
      url,
      redirect: init?.redirect,
      signature: headers.get("x-webhook-signature"),
    });

    if (url === "https://hooks.example.com/start") {
      if (init?.redirect === "manual") {
        return new Response(null, { status, headers: { location: target } });
      }

      // Model ordinary fetch redirect behavior so the pre-fix dispatcher exposes
      // whether the signed request can escape the application URL guard.
      const redirected = new URL(target, url).toString();
      calls.push({
        url: redirected,
        redirect: init?.redirect,
        signature: headers.get("x-webhook-signature"),
      });
      return new Response("ok", { status: 200 });
    }

    return new Response("ok", { status: 200 });
  }) as typeof fetch;

  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

test("AP-ISS-0027: same-origin 307 is followed only through manual per-hop validation", async () => {
  const fixture = installRedirectFixture("/next");
  try {
    const result = await deliverWebhook(
      "https://hooks.example.com/start",
      payload,
      "test-secret",
      0
    );

    assert.equal(result.success, true);
    assert.equal(fixture.calls.length, 2);
    assert.deepEqual(
      fixture.calls.map((call) => call.url),
      ["https://hooks.example.com/start", "https://hooks.example.com/next"]
    );
    assert.ok(fixture.calls.every((call) => call.redirect === "manual"));
    assert.ok(fixture.calls[0].signature);
    assert.equal(fixture.calls[1].signature, fixture.calls[0].signature);
  } finally {
    fixture.restore();
  }
});

test("AP-ISS-0027: signed webhook never follows a cross-origin 307", async () => {
  const fixture = installRedirectFixture("https://other.example.net/next");
  try {
    const result = await deliverWebhook(
      "https://hooks.example.com/start",
      payload,
      "test-secret",
      0
    );

    assert.equal(result.success, false);
    assert.equal(fixture.calls.length, 1);
    assert.equal(fixture.calls[0].redirect, "manual");
    assert.ok(fixture.calls[0].signature);
  } finally {
    fixture.restore();
  }
});

test("AP-ISS-0027: same-origin 308 is followed through the same validated path", async () => {
  const fixture = installRedirectFixture("/next", 308);
  try {
    const result = await deliverWebhook(
      "https://hooks.example.com/start",
      payload,
      "test-secret",
      0
    );
    assert.equal(result.success, true);
    assert.equal(fixture.calls.length, 2);
    assert.ok(fixture.calls.every((call) => call.redirect === "manual"));
    assert.equal(fixture.calls[1].signature, fixture.calls[0].signature);
  } finally {
    fixture.restore();
  }
});

test("AP-ISS-0027: signed webhook never follows a cross-origin 308", async () => {
  const fixture = installRedirectFixture("https://other.example.net/next", 308);
  try {
    const result = await deliverWebhook(
      "https://hooks.example.com/start",
      payload,
      "test-secret",
      0
    );
    assert.equal(result.success, false);
    assert.equal(fixture.calls.length, 1);
    assert.equal(fixture.calls[0].redirect, "manual");
  } finally {
    fixture.restore();
  }
});

test("AP-ISS-0027: redirect to cloud metadata is rejected before a second request", async () => {
  const previousPrivateOptIn = process.env.AGENTPROXY_ALLOW_PRIVATE_PROVIDER_URLS;
  delete process.env.AGENTPROXY_ALLOW_PRIVATE_PROVIDER_URLS;
  const fixture = installRedirectFixture("http://169.254.169.254/latest/meta-data/");

  try {
    const result = await deliverWebhook(
      "https://hooks.example.com/start",
      payload,
      "test-secret",
      0
    );

    assert.equal(result.success, false);
    assert.equal(fixture.calls.length, 1);
    assert.equal(fixture.calls[0].redirect, "manual");
  } finally {
    fixture.restore();
    if (previousPrivateOptIn === undefined) {
      delete process.env.AGENTPROXY_ALLOW_PRIVATE_PROVIDER_URLS;
    } else {
      process.env.AGENTPROXY_ALLOW_PRIVATE_PROVIDER_URLS = previousPrivateOptIn;
    }
  }
});
