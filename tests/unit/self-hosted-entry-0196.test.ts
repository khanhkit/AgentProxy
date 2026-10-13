import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { handleSelfHostedCompletions } from "../../open-sse/services/selfHostedEntry.ts";

async function withServer(
  responder: (req: http.IncomingMessage, body: string) => { status: number; body: string },
  run: (baseUrl: string, calls: () => number) => Promise<void>
): Promise<void> {
  let count = 0;
  const server = http.createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      count++;
      const out = responder(req, body);
      res.writeHead(out.status, { "content-type": "application/json" });
      res.end(out.body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server address unavailable");
  try {
    await run(`http://127.0.0.1:${address.port}/v1`, () => count);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}

const req = (headers?: HeadersInit) =>
  new Request("http://agentproxy.local/v1/chat/completions", { method: "POST", headers });

function providerYaml(entries: Array<{ id: string; baseUrl: string; apiKey?: string }>): string {
  return `providers:\n${entries
    .map(
      (p) =>
        `  - id: ${p.id}\n    kind: openai\n    baseUrl: ${p.baseUrl}\n    model: model-${p.id}${p.apiKey ? `\n    apiKey: ${p.apiKey}` : ""}`
    )
    .join("\n")}\n`;
}

test("AP-ISS-0196: configured provider credentials require a shared self-hosted entry key", async () => {
  await withServer(
    () => ({ status: 200, body: '{"ok":true}' }),
    async (baseUrl, calls) => {
      const res = await handleSelfHostedCompletions(
        req(),
        { messages: [{ role: "user", content: "hi" }] },
        { providers: providerYaml([{ id: "cred", baseUrl, apiKey: "provider-secret" }]) }
      );
      assert.ok(res);
      assert.equal(
        res.status,
        503,
        "server-side provider credentials must not be exposed by an open entry"
      );
      assert.equal(calls(), 0, "unauthenticated traffic must not consume provider credentials");
    }
  );
});

test("AP-ISS-0196: unknown explicit provider header fails closed instead of falling through", async () => {
  await withServer(
    () => ({ status: 200, body: '{"ok":true}' }),
    async (baseUrl, calls) => {
      const res = await handleSelfHostedCompletions(
        req({ "x-omniroute-provider": "missing" }),
        { model: "backup/model-backup", messages: [{ role: "user", content: "hi" }] },
        { providers: providerYaml([{ id: "backup", baseUrl }]) }
      );
      assert.ok(res);
      assert.equal(res.status, 400);
      assert.equal(calls(), 0, "an invalid authoritative header must not silently reroute");
    }
  );
});

test("AP-ISS-0196: unknown explicit provider model prefix fails closed", async () => {
  await withServer(
    () => ({ status: 200, body: '{"ok":true}' }),
    async (baseUrl, calls) => {
      const res = await handleSelfHostedCompletions(
        req(),
        { model: "missing/model-x", messages: [{ role: "user", content: "hi" }] },
        { providers: providerYaml([{ id: "primary", baseUrl }]) }
      );
      assert.ok(res);
      assert.equal(res.status, 400);
      assert.equal(calls(), 0, "unknown explicit model prefix must not become an unpinned request");
    }
  );
});

test("AP-ISS-0196: permanent non-2xx response is terminal and not replayed to sibling provider", async () => {
  await withServer(
    () => ({ status: 400, body: '{"error":{"message":"bad request"}}' }),
    async (primaryUrl, primaryCalls) => {
      await withServer(
        () => ({ status: 200, body: '{"ok":true}' }),
        async (backupUrl, backupCalls) => {
          const providers = providerYaml([
            { id: "primary", baseUrl: primaryUrl },
            { id: "backup", baseUrl: backupUrl },
          ]);
          const res = await handleSelfHostedCompletions(
            req(),
            { messages: [{ role: "user", content: "hi" }] },
            { providers }
          );
          assert.ok(res);
          assert.equal(res.status, 400, "permanent client/provider validation errors are terminal");
          assert.equal(primaryCalls(), 1);
          assert.equal(backupCalls(), 0, "permanent non-2xx must not replay the request");
        }
      );
    }
  );
});

test("AP-ISS-0196: network failures do not expose internal transport details", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("connect ECONNREFUSED secret.internal.local:7443 /etc/internal/client.pem");
  };
  try {
    const res = await handleSelfHostedCompletions(
      req(),
      { messages: [{ role: "user", content: "hi" }] },
      { providers: providerYaml([{ id: "internal", baseUrl: "http://127.0.0.1:7443" }]) }
    );
    assert.ok(res);
    assert.equal(res.status, 502);
    const text = await res.text();
    assert.match(text, /Upstream provider unreachable/i);
    assert.doesNotMatch(text, /secret\.internal\.local|7443|client\.pem|ECONNREFUSED/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AP-ISS-0196: same-length provider config edits after byte 64 invalidate the runtime cache", async () => {
  const authorizations: string[] = [];
  await withServer(
    (request) => {
      authorizations.push(request.headers.authorization ?? "");
      return { status: 200, body: '{"ok":true}' };
    },
    async (baseUrl) => {
      const prefix = `# ${"x".repeat(96)}\n`;
      const makeSource = (secret: string) =>
        `${prefix}providers:\n  - id: cache-test\n    kind: openai\n    baseUrl: ${baseUrl}\n    model: test-model\n    apiKey: ${secret}\n`;
      const request = req({ authorization: "Bearer entry-key" });
      const first = await handleSelfHostedCompletions(
        request,
        { messages: [{ role: "user", content: "first" }] },
        { providers: makeSource("secret-A"), apiKey: "entry-key" }
      );
      assert.equal(first?.status, 200);
      const second = await handleSelfHostedCompletions(
        request,
        { messages: [{ role: "user", content: "second" }] },
        { providers: makeSource("secret-B"), apiKey: "entry-key" }
      );
      assert.equal(second?.status, 200);
      assert.deepEqual(authorizations, ["Bearer secret-A", "Bearer secret-B"]);
    }
  );
});

test("AP-ISS-0196: partial strategy override preserves omitted inline rules", async () => {
  await withServer(
    () => ({ status: 200, body: '{"ok":true}' }),
    async (blockedUrl, blockedCalls) => {
      await withServer(
        () => ({ status: 200, body: '{"ok":true}' }),
        async (allowedUrl, allowedCalls) => {
          const providers = `providers:
  - id: blocked
    kind: openai
    baseUrl: ${blockedUrl}
    model: blocked-model
  - id: allowed
    kind: openai
    baseUrl: ${allowedUrl}
    model: allowed-model
strategy:
  blacklist: [blocked]
`;
          const res = await handleSelfHostedCompletions(
            req(),
            { messages: [{ role: "user", content: "hi" }] },
            { providers, strategy: "costPriority: true\n" }
          );
          assert.equal(res?.status, 200);
          assert.equal(blockedCalls(), 0);
          assert.equal(allowedCalls(), 1);
        }
      );
    }
  );
});
