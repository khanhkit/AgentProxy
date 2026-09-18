import assert from "node:assert/strict";
import test from "node:test";

import { fetchRemoteImage } from "../../../src/shared/network/remoteImageFetch.ts";

test("TC-REMOTE-SEC-001 client default rejects private/local variants before fetch and accepts public fixture", async () => {
  const blockedUrls = [
    "http://127.0.0.1/private.png",
    "http://192.168.1.50/private.png",
    "http://169.254.169.254/latest/meta-data",
    "http://localhost.:8080/private.png",
    "http://2130706433/private.png",
    "http://0x7f.1/private.png",
    "http://0177.0.0.1/private.png",
  ];

  for (const url of blockedUrls) {
    let fetchCalls = 0;
    await assert.rejects(() =>
      fetchRemoteImage(url, {
        fetchImpl: async () => {
          fetchCalls += 1;
          return new Response("unexpected");
        },
      })
    );
    assert.equal(fetchCalls, 0, `blocked destination must not reach fetch: ${url}`);
  }

  let publicFetchCalls = 0;
  const publicResult = await fetchRemoteImage("https://public.example/image.png", {
    lookup: async () => [{ address: "203.0.113.10", family: 4 }],
    fetchImpl: async () => {
      publicFetchCalls += 1;
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    },
  });

  assert.equal(publicFetchCalls, 1);
  assert.equal(publicResult.buffer.toString("base64"), "AQID");
});

test("TC-REMOTE-SEC-002 redirect to private destination is rejected before second fetch", async () => {
  let fetchCalls = 0;

  await assert.rejects(() =>
    fetchRemoteImage("https://public.example/image.png", {
      lookup: async () => [{ address: "203.0.113.10", family: 4 }],
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/private.png" },
        });
      },
    })
  );

  assert.equal(fetchCalls, 1, "private redirect must be rejected before a second fetch");
});

test("TC-REMOTE-SEC-003 mixed DNS answers reject before fetch", async () => {
  let fetchCalls = 0;

  await assert.rejects(
    () =>
      fetchRemoteImage("https://media.example/image.png", {
        lookup: async () => [
          { address: "203.0.113.10", family: 4 },
          { address: "10.0.0.7", family: 4 },
        ],
        fetchImpl: async () => {
          fetchCalls += 1;
          return new Response("unexpected");
        },
      }),
    /blocked private address/i
  );

  assert.equal(fetchCalls, 0, "a mixed DNS answer set must fail before transport");
});

test("TC-REMOTE-SEC-004 explicit provider-local policy allows RFC1918 but still blocks metadata", async () => {
  let fetchCalls = 0;
  const providerResult = await fetchRemoteImage("http://192.168.1.50/image.png", {
    guard: "block-metadata",
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response(new Uint8Array([4, 5, 6]), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    },
  });

  assert.equal(fetchCalls, 1);
  assert.equal(providerResult.buffer.toString("base64"), "BAUG");

  await assert.rejects(() =>
    fetchRemoteImage("http://169.254.169.254/latest/meta-data", {
      guard: "block-metadata",
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response("unexpected");
      },
    })
  );

  assert.equal(fetchCalls, 1, "metadata must be rejected before the provider-local fetch seam");
});
