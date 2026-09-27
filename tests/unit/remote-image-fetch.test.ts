import assert from "node:assert/strict";
import test from "node:test";

import { fetchRemoteImage } from "@/shared/network/remoteImageFetch";

// Stub DNS resolver: every (unused) hostname resolves to a public IP. The
// rebinding guard (GHSA-cmhj-wh2f-9cgx) needs a non-empty resolution; without
// it, fictitious hosts like `cdn.example.com` would correctly be rejected.
const publicLookup = async () => [{ address: "203.0.113.5" as string, family: 4 }];

test("fetchRemoteImage reads public image bytes", async () => {
  const result = await fetchRemoteImage("https://cdn.example.com/image.png", {
    fetchImpl: async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    guard: "public-only",
    lookup: publicLookup,
  });

  assert.equal(result.buffer.toString("base64"), "AQID");
  assert.equal(result.contentType, "image/png");
});

test("fetchRemoteImage blocks private image hosts before fetch", async () => {
  let called = false;

  await assert.rejects(
    () =>
      fetchRemoteImage("http://127.0.0.1:20128/private.png", {
        fetchImpl: async () => {
          called = true;
          return new Response("unexpected");
        },
        guard: "public-only",
      }),
    /Blocked private or local provider URL/
  );

  assert.equal(called, false);
});

test("fetchRemoteImage blocks redirects to private image hosts", async () => {
  await assert.rejects(
    () =>
      fetchRemoteImage("https://cdn.example.com/redirect.png", {
        fetchImpl: async () =>
          new Response(null, {
            status: 302,
            headers: { location: "http://169.254.169.254/latest/meta-data" },
          }),
        guard: "public-only",
        lookup: publicLookup,
      }),
    /Blocked private or local provider URL/
  );
});

test("fetchRemoteImage blocks cloud-metadata hosts under the default client-safe guard", async () => {
  let called = false;

  await assert.rejects(
    () =>
      fetchRemoteImage("http://169.254.169.254/latest/meta-data", {
        fetchImpl: async () => {
          called = true;
          return new Response("unexpected");
        },
      }),
    /Blocked private or local provider URL/
  );

  assert.equal(called, false);
});

test("fetchRemoteImage blocks private/LAN image hosts by default", async () => {
  let called = false;

  await assert.rejects(
    () =>
      fetchRemoteImage("http://192.168.1.50:8080/local.png", {
        fetchImpl: async () => {
          called = true;
          return new Response("unexpected");
        },
      }),
    /Blocked private or local provider URL/
  );

  assert.equal(called, false);
});

test("fetchRemoteImage preserves explicit local-first provider policy", async () => {
  const result = await fetchRemoteImage("http://192.168.1.50:8080/local.png", {
    fetchImpl: async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    guard: "block-metadata",
  });

  assert.equal(result.buffer.toString("base64"), "AQID");
});

test("fetchRemoteImage blocks numeric loopback spellings before fetch", async () => {
  for (const url of [
    "http://2130706433/private.png",
    "http://0x7f.1/private.png",
    "http://0177.0.0.1/private.png",
  ]) {
    let called = false;

    await assert.rejects(
      () =>
        fetchRemoteImage(url, {
          fetchImpl: async () => {
            called = true;
            return new Response("unexpected");
          },
        }),
      /Blocked private or local provider URL/
    );

    assert.equal(called, false, `fetch should not run for ${url}`);
  }
});

test("fetchRemoteImage blocks trailing-dot localhost before fetch", async () => {
  let called = false;

  await assert.rejects(
    () =>
      fetchRemoteImage("http://localhost.:8080/private.png", {
        fetchImpl: async () => {
          called = true;
          return new Response("unexpected");
        },
      }),
    /Blocked private or local provider URL/
  );

  assert.equal(called, false);
});

test("fetchRemoteImage blocks redirects to cloud-metadata hosts under the default client-safe guard", async () => {
  await assert.rejects(
    () =>
      fetchRemoteImage("https://cdn.example.com/redirect.png", {
        fetchImpl: async () =>
          new Response(null, {
            status: 302,
            headers: { location: "http://169.254.169.254/latest/meta-data" },
          }),
        lookup: publicLookup,
      }),
    /Blocked private or local provider URL/
  );
});
