import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { startHttpProxyServer } from "../../../src/mitm/inspector/httpProxyServer.ts";
import {
  SafeOutboundFetchError,
  safeOutboundFetch,
} from "../../../src/shared/network/safeOutboundFetch.ts";

async function startLoopbackTarget() {
  let hits = 0;
  const server = http.createServer((_req, res) => {
    hits += 1;
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("loopback-reached");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    port: address.port,
    hits: () => hits,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function requestViaProxy(proxyPort: number, targetPort: number) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: proxyPort,
        method: "GET",
        path: "http://127.0.0.1:" + targetPort + "/private",
        headers: { host: "127.0.0.1:" + targetPort },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          })
        );
      }
    );
    req.once("error", reject);
    req.end();
  });
}

test("TC-MITM-HTTP-EGRESS-0114 rejects loopback before the direct HTTP target is reached", async () => {
  const target = await startLoopbackTarget();
  const proxy = await startHttpProxyServer(0);
  try {
    const response = await requestViaProxy(proxy.port, target.port);
    assert.equal(response.status, 502);
    assert.match(response.body, /Bad Gateway/i);
    assert.equal(target.hits(), 0, "blocked destination must not receive an upstream request");
  } finally {
    await proxy.stop();
    await target.close();
  }
});

test("TC-MITM-HTTP-EGRESS-0114 preserves public HTTP non-standard port compatibility", async () => {
  let fetchCalls = 0;
  const response = await safeOutboundFetch("http://public.example.test:8088/resource", {
    guard: "public-only",
    pinDns: true,
    retry: false,
    allowRedirect: false,
    dnsLookup: async () => [{ address: "203.0.113.10", family: 4 }],
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response("ok", { status: 200 });
    },
  });

  assert.equal(response.status, 200);
  assert.equal(fetchCalls, 1);
});

test("TC-MITM-HTTP-EGRESS-0114 rejects public-name to private-address rebinding before fetch", async () => {
  let fetchCalls = 0;
  await assert.rejects(
    safeOutboundFetch("http://public.example.test:8088/resource", {
      guard: "public-only",
      pinDns: true,
      retry: false,
      allowRedirect: false,
      dnsLookup: async () => [{ address: "127.0.0.1", family: 4 }],
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response("unexpected");
      },
    }),
    (error) => {
      assert.ok(error instanceof SafeOutboundFetchError);
      assert.equal(error.code, "URL_GUARD_BLOCKED");
      return true;
    }
  );
  assert.equal(fetchCalls, 0);
});
