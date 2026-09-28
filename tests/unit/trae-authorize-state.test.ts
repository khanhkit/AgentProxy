import assert from "node:assert/strict";
import test from "node:test";

test("Trae callback state is server-issued and consumable exactly once", async () => {
  let stateModule: typeof import("../../src/lib/oauth/traeCallbackState.ts") | null = null;
  try {
    stateModule = await import("../../src/lib/oauth/traeCallbackState.ts");
  } catch {
    // RED until the production state boundary exists.
  }

  assert.ok(stateModule, "Trae callback state boundary must exist");
  const issued = stateModule.mintTraeCallbackState(1_000);
  assert.match(issued.state, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(stateModule.consumeTraeCallbackState(issued.state, 1_001), true);
  assert.equal(stateModule.consumeTraeCallbackState(issued.state, 1_002), false);
});

test("Trae callback state expires after the bounded five-minute window", async () => {
  const stateModule = await import("../../src/lib/oauth/traeCallbackState.ts");
  const issued = stateModule.mintTraeCallbackState(10_000);
  assert.equal(stateModule.consumeTraeCallbackState(issued.state, 10_000 + 5 * 60 * 1000), false);
});

test("Trae callback peer admission trusts only authenticated direct loopback stamps", async () => {
  const stateModule = await import("../../src/lib/oauth/traeCallbackState.ts");
  assert.equal(
    typeof stateModule.isTrustedTraeCallbackPeer,
    "function",
    "Trae callback state boundary must expose trusted peer admission"
  );

  const originalToken = process.env.AGENTPROXY_PEER_STAMP_TOKEN;
  const token = "trae-callback-peer-test-token";
  process.env.AGENTPROXY_PEER_STAMP_TOKEN = token;

  try {
    const request = (peer: string, viaProxy = "0") =>
      new Request("http://127.0.0.1:20128/authorize", {
        headers: {
          "x-agentproxy-peer-ip": `${token}|${peer}`,
          "x-agentproxy-via-proxy": `${token}|${viaProxy}`,
        },
      });

    assert.equal(stateModule.isTrustedTraeCallbackPeer(request("127.0.0.1")), true);
    assert.equal(stateModule.isTrustedTraeCallbackPeer(request("::1")), true);
    assert.equal(stateModule.isTrustedTraeCallbackPeer(request("127.0.0.1", "1")), false);
    assert.equal(stateModule.isTrustedTraeCallbackPeer(request("8.8.8.8")), false);

    const forged = new Request("http://127.0.0.1:20128/authorize", {
      headers: {
        "x-agentproxy-peer-ip": "forged-token|127.0.0.1",
        "x-agentproxy-via-proxy": "forged-token|0",
      },
    });
    assert.equal(stateModule.isTrustedTraeCallbackPeer(forged), false);
  } finally {
    if (originalToken === undefined) delete process.env.AGENTPROXY_PEER_STAMP_TOKEN;
    else process.env.AGENTPROXY_PEER_STAMP_TOKEN = originalToken;
  }
});

test("Trae authorize-state endpoint mints state only for trusted same-origin loopback requests", async () => {
  let routeModule: { POST?: (request: Request) => Promise<Response> } | null = null;
  try {
    routeModule = await import("../../src/app/api/oauth/trae/authorize-state/route.ts");
  } catch {
    // RED until the initiation endpoint exists.
  }
  assert.equal(typeof routeModule?.POST, "function", "Trae authorize-state endpoint must exist");

  const localRequest = new Request("http://127.0.0.1:20128/api/oauth/trae/authorize-state", {
    method: "POST",
    headers: {
      "x-agentproxy-peer-locality": "loopback",
      origin: "http://127.0.0.1:20128",
      "sec-fetch-site": "same-origin",
    },
  });
  const localResponse = await routeModule!.POST!(localRequest);
  assert.equal(localResponse.status, 200);
  const localBody = (await localResponse.json()) as { state?: string };
  assert.match(localBody.state ?? "", /^[A-Za-z0-9_-]{40,}$/);

  const remoteResponse = await routeModule!.POST!(
    new Request("https://gateway.example.test/api/oauth/trae/authorize-state", {
      method: "POST",
      headers: { "x-agentproxy-peer-locality": "remote" },
    })
  );
  assert.equal(remoteResponse.status, 403);

  const crossOriginResponse = await routeModule!.POST!(
    new Request("http://127.0.0.1:20128/api/oauth/trae/authorize-state", {
      method: "POST",
      headers: {
        "x-agentproxy-peer-locality": "loopback",
        origin: "https://evil.example.test",
        "sec-fetch-site": "cross-site",
      },
    })
  );
  assert.equal(crossOriginResponse.status, 403);
});

function validTraeCallbackUrl(state?: string): string {
  const url = new URL("http://127.0.0.1:20128/authorize");
  url.searchParams.set("isRedirect", "true");
  url.searchParams.set("scope", "solo");
  url.searchParams.set("host", "https://api-us-east.trae.ai");
  url.searchParams.set(
    "userJwt",
    JSON.stringify({
      ClientID: "en1oxy7wnw8j9n",
      Token: "DEV_TRAE_ACCESS_TOKEN",
      RefreshToken: "DEV_TRAE_REFRESH_TOKEN",
      TokenExpireAt: Date.UTC(2026, 5, 6),
      RefreshExpireAt: Date.UTC(2026, 11, 19),
    })
  );
  url.searchParams.set(
    "userInfo",
    JSON.stringify({
      UserID: "dev-trae-user",
      TenantID: "dev-trae-tenant",
      Region: "US-East",
      AIRegion: "US",
      NonPlainTextEmail: "d***v@example.test",
    })
  );
  if (state) url.searchParams.set("loginTraceID", state);
  return url.toString();
}

test("Trae /authorize rejects a remote callback before consuming state or persisting", async () => {
  const stateModule = await import("../../src/lib/oauth/traeCallbackState.ts");
  const providersDb = await import("../../src/lib/db/providers.ts");
  const authorizeRoute = await import("../../src/app/authorize/route.ts");
  const token = "trae-authorize-route-peer-token";
  const originalToken = process.env.AGENTPROXY_PEER_STAMP_TOKEN;
  process.env.AGENTPROXY_PEER_STAMP_TOKEN = token;
  const issued = stateModule.mintTraeCallbackState();
  const before = providersDb.getProviderConnectionsCount();

  try {
    let response: Response;
    try {
      response = await authorizeRoute.GET(
        new Request(validTraeCallbackUrl(issued.state), {
          headers: {
            "x-agentproxy-peer-ip": `${token}|203.0.113.20`,
            "x-agentproxy-via-proxy": `${token}|0`,
          },
        })
      );
    } catch (error) {
      assert.fail(
        `remote callback must be rejected before presentation dependencies: ${String(error)}`
      );
    }

    assert.equal(response.status, 403);
    assert.equal(providersDb.getProviderConnectionsCount(), before);
    assert.equal(
      stateModule.consumeTraeCallbackState(issued.state),
      true,
      "remote rejection must not burn the pending state"
    );
  } finally {
    if (originalToken === undefined) delete process.env.AGENTPROXY_PEER_STAMP_TOKEN;
    else process.env.AGENTPROXY_PEER_STAMP_TOKEN = originalToken;
  }
});

test("Trae /authorize rejects a loopback callback without server-bound state before persisting", async () => {
  const providersDb = await import("../../src/lib/db/providers.ts");
  const authorizeRoute = await import("../../src/app/authorize/route.ts");
  const token = "trae-authorize-missing-state-token";
  const originalToken = process.env.AGENTPROXY_PEER_STAMP_TOKEN;
  process.env.AGENTPROXY_PEER_STAMP_TOKEN = token;
  const before = providersDb.getProviderConnectionsCount();

  try {
    let response: Response;
    try {
      response = await authorizeRoute.GET(
        new Request(validTraeCallbackUrl(), {
          headers: {
            "x-agentproxy-peer-ip": `${token}|127.0.0.1`,
            "x-agentproxy-via-proxy": `${token}|0`,
          },
        })
      );
    } catch (error) {
      assert.fail(
        `missing-state callback must be rejected before presentation dependencies: ${String(error)}`
      );
    }

    assert.equal(response.status, 403);
    assert.equal(providersDb.getProviderConnectionsCount(), before);
  } finally {
    if (originalToken === undefined) delete process.env.AGENTPROXY_PEER_STAMP_TOKEN;
    else process.env.AGENTPROXY_PEER_STAMP_TOKEN = originalToken;
  }
});

test("Trae callback processor persists one valid local callback and denies replay", async () => {
  let processorModule: {
    processTraeAuthorizeCallback?: (request: Request) => Promise<{
      ok: boolean;
      connectionId?: string;
      loginTraceId?: string | null;
      error?: string;
    }>;
  } | null = null;
  try {
    processorModule = await import("../../src/app/authorize/processCallback.ts");
  } catch {
    // RED until the presentation-independent callback processor exists.
  }
  assert.equal(
    typeof processorModule?.processTraeAuthorizeCallback,
    "function",
    "Trae callback processor must exist"
  );

  const stateModule = await import("../../src/lib/oauth/traeCallbackState.ts");
  const providersDb = await import("../../src/lib/db/providers.ts");
  const token = "trae-authorize-positive-token";
  const originalToken = process.env.AGENTPROXY_PEER_STAMP_TOKEN;
  process.env.AGENTPROXY_PEER_STAMP_TOKEN = token;
  const issued = stateModule.mintTraeCallbackState();
  const url = validTraeCallbackUrl(issued.state);
  const headers = {
    "x-agentproxy-peer-ip": `${token}|127.0.0.1`,
    "x-agentproxy-via-proxy": `${token}|0`,
  };
  const before = providersDb.getProviderConnectionsCount();

  try {
    const first = await processorModule!.processTraeAuthorizeCallback!(
      new Request(url, { headers })
    );
    assert.equal(first.ok, true);
    assert.equal(typeof first.connectionId, "string");
    assert.equal(first.loginTraceId, issued.state);
    assert.equal(providersDb.getProviderConnectionsCount(), before + 1);

    const replay = await processorModule!.processTraeAuthorizeCallback!(
      new Request(url, { headers })
    );
    assert.equal(replay.ok, false);
    assert.match(replay.error ?? "", /state/i);
    assert.equal(providersDb.getProviderConnectionsCount(), before + 1);
  } finally {
    if (originalToken === undefined) delete process.env.AGENTPROXY_PEER_STAMP_TOKEN;
    else process.env.AGENTPROXY_PEER_STAMP_TOKEN = originalToken;
  }
});
