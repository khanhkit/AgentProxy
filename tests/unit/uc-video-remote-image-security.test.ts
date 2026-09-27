import assert from "node:assert/strict";
import test from "node:test";

import {
  handleUcVideoGeneration,
  UC_PERSONA_IMAGE_TO_VIDEO_URL,
  UC_PERSONA_SIGNED_URL,
} from "../../open-sse/handlers/videoGeneration/providers/ucVideo.ts";
import { isUcClerkMintUrl } from "./helpers/ucClerkUrl.ts";

const PERSONA_CRED = {
  providerSpecificData: {
    ucClientCookie: "clientcookie-abc",
    ucSid: "sess_123",
    ucUid: "b03dd963-d0c1-4193-99c9-f5a9d0c66b7f",
    ucCookies: { __client: "clientcookie-abc", __cf_bm: "cf" },
  },
};

function fakeJwt(uid: string): string {
  const b64 = (value: unknown) =>
    Buffer.from(JSON.stringify(value))
      .toString("base64")
      .replace(/=+$/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  const exp = Math.floor(Date.now() / 1000) + 60;
  return `${b64({ alg: "RS256" })}.${b64({ uid, exp, sub: "user_1", sid: "sess_123" })}.sig`;
}

type ProviderFetchState = {
  remoteInputCalls: number;
  signedCalls: number;
  uploadCalls: number;
  uploadedBody: Uint8Array | null;
};

function makeProviderFetch(remoteInputUrl: string): {
  fetchImpl: typeof fetch;
  state: ProviderFetchState;
} {
  const state: ProviderFetchState = {
    remoteInputCalls: 0,
    signedCalls: 0,
    uploadCalls: 0,
    uploadedBody: null,
  };
  const resultUrl = "https://videogen.moveinwater.com/ap-iss-0023-result";
  const jwt = fakeJwt("b03dd963-d0c1-4193-99c9-f5a9d0c66b7f");

  const fetchImpl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    if (isUcClerkMintUrl(url)) {
      return new Response(JSON.stringify({ object: "token", jwt }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    // This branch proves the pre-change vulnerability: the UC provider transport
    // itself currently fetches the client-controlled image URL.
    if (url === remoteInputUrl) {
      state.remoteInputCalls += 1;
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }
    if (url === UC_PERSONA_SIGNED_URL) {
      state.signedCalls += 1;
      return Response.json({
        signed_url: "https://d.moveinwater.com/up/ap-iss-0023",
        blob_name: "blob_ap_iss_0023",
      });
    }
    if (url === "https://d.moveinwater.com/up/ap-iss-0023") {
      state.uploadCalls += 1;
      const body = init.body;
      if (body instanceof Uint8Array) state.uploadedBody = new Uint8Array(body);
      return new Response(null, { status: 200 });
    }
    if (url === UC_PERSONA_IMAGE_TO_VIDEO_URL) {
      return Response.json({
        request_id: "req_ap_iss_0023",
        url: resultUrl,
        timeout_seconds: 10,
      });
    }
    if (url === resultUrl) return new Response(null, { status: 200 });
    throw new Error(`unexpected provider fetch to ${url}`);
  }) as unknown as typeof fetch;

  return { fetchImpl, state };
}

async function runPersonaRemoteImage(args: {
  imageUrl: string;
  remoteFetchImpl?: typeof fetch;
  lookup?: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
}) {
  const provider = makeProviderFetch(args.imageUrl);
  const result = await handleUcVideoGeneration({
    model: "uc/wan-2.2-spicy",
    provider: "uc",
    body: { prompt: "animate this", image: args.imageUrl, poll_interval_ms: 1 },
    credentials: PERSONA_CRED,
    fetchImpl: provider.fetchImpl,
    sleepImpl: async () => {},
    remoteImageFetchOptions: {
      ...(args.remoteFetchImpl ? { fetchImpl: args.remoteFetchImpl } : {}),
      ...(args.lookup ? { lookup: args.lookup } : {}),
    },
  });
  return { result, state: provider.state };
}

test("AP-ISS-0023 rejects loopback UC persona image input before signed upload", async () => {
  let remoteFetchCalled = false;
  const { result, state } = await runPersonaRemoteImage({
    imageUrl: "http://127.0.0.1/private.png",
    remoteFetchImpl: (async () => {
      remoteFetchCalled = true;
      return new Response("unexpected");
    }) as unknown as typeof fetch,
  });

  assert.equal(result.success, false);
  assert.equal(result.status, 400);
  assert.equal(state.signedCalls, 0, "blocked client media must not reach signed upload");
  assert.equal(remoteFetchCalled, false, "loopback must be rejected before remote fetch");
  assert.equal(state.remoteInputCalls, 0, "provider transport must never fetch client media");
});

test("AP-ISS-0023 rejects a redirect from public UC persona image input to private network", async () => {
  const imageUrl = "https://203.0.113.10/input.png";
  let remoteFetchCalls = 0;
  const { result, state } = await runPersonaRemoteImage({
    imageUrl,
    remoteFetchImpl: (async () => {
      remoteFetchCalls += 1;
      return new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/redirect-target.png" },
      });
    }) as unknown as typeof fetch,
  });

  assert.equal(result.success, false);
  assert.equal(result.status, 400);
  assert.equal(remoteFetchCalls, 1, "only the validated public hop may be fetched");
  assert.equal(state.signedCalls, 0);
  assert.equal(state.remoteInputCalls, 0);
});

test("AP-ISS-0023 rejects UC persona image DNS rebinding before any remote fetch", async () => {
  const imageUrl = "https://attacker.example.test/input.png";
  let remoteFetchCalled = false;
  const { result, state } = await runPersonaRemoteImage({
    imageUrl,
    lookup: async () => [{ address: "127.0.0.1", family: 4 }],
    remoteFetchImpl: (async () => {
      remoteFetchCalled = true;
      return new Response("unexpected");
    }) as unknown as typeof fetch,
  });

  assert.equal(result.success, false);
  assert.equal(result.status, 400);
  assert.equal(remoteFetchCalled, false, "private DNS answer must reject before transport");
  assert.equal(state.signedCalls, 0);
  assert.equal(state.remoteInputCalls, 0);
});

test("AP-ISS-0023 rejects oversized UC persona remote image before signed upload", async () => {
  const imageUrl = "https://203.0.113.10/too-large.png";
  const { result, state } = await runPersonaRemoteImage({
    imageUrl,
    remoteFetchImpl: (async () =>
      new Response(new Uint8Array([1]), {
        status: 200,
        headers: {
          "content-type": "image/png",
          "content-length": String(20 * 1024 * 1024 + 1),
        },
      })) as unknown as typeof fetch,
  });

  assert.equal(result.success, false);
  assert.equal(result.status, 400);
  assert.equal(state.signedCalls, 0);
  assert.equal(state.remoteInputCalls, 0);
});

test("AP-ISS-0023 allows a bounded public UC persona remote image and uploads its bytes", async () => {
  const imageUrl = "https://cdn.example.test/input.png";
  let remoteFetchCalls = 0;
  const { result, state } = await runPersonaRemoteImage({
    imageUrl,
    lookup: async () => [{ address: "203.0.113.10", family: 4 }],
    remoteFetchImpl: (async () => {
      remoteFetchCalls += 1;
      return new Response(new Uint8Array([7, 8, 9]), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }) as unknown as typeof fetch,
  });

  assert.equal(result.success, true);
  assert.equal(remoteFetchCalls, 1);
  assert.equal(state.remoteInputCalls, 0, "provider transport must not fetch client media");
  assert.equal(state.signedCalls, 1);
  assert.equal(state.uploadCalls, 1);
  assert.deepEqual(state.uploadedBody, new Uint8Array([7, 8, 9]));
});
