import assert from "node:assert/strict";
import test from "node:test";

import {
  RequestBodyTooLargeError,
  checkBodySize,
  getBodySizeLimit,
  getConfiguredBodySizeLimitBytes,
  readRequestBodyWithLimit,
} from "../../../src/shared/middleware/bodySizeGuard.ts";

const MEDIA_PATHS = [
  "/api/v1/images/generations",
  "/api/v1/images/edits",
  "/api/v1/images/upscale",
  "/api/v1/videos/generations",
  "/api/v1/providers/openai/images/generations",
] as const;

function assertFinitePositiveLimit(pathname: string): number {
  const limit = getBodySizeLimit(pathname, { maxBodySizeMb: 10 });
  assert.ok(Number.isFinite(limit), `${pathname} must resolve a finite media body limit; got ${limit}`);
  assert.ok(Number.isSafeInteger(limit), `${pathname} limit must be a safe integer; got ${limit}`);
  assert.ok(limit > 0, `${pathname} limit must be positive; got ${limit}`);
  return limit;
}

test("TC-MEDIA-BODY-SEC-001 media paths use finite budgets and reject declared oversize", async () => {
  for (const pathname of MEDIA_PATHS) {
    const limit = assertFinitePositiveLimit(pathname);
    const request = new Request(`http://localhost${pathname}`, {
      method: "POST",
      headers: { "content-length": String(limit + 1) },
    });

    const rejection = checkBodySize(request, limit);
    assert.ok(rejection, `${pathname} must reject declared bytes above its resolved limit`);
    assert.equal(rejection.status, 413, `${pathname} must return 413 for declared oversize`);
    const payload = (await rejection.json()) as {
      error?: { code?: string; type?: string; message?: string };
    };
    assert.equal(payload.error?.code, "PAYLOAD_TOO_LARGE");
    assert.equal(payload.error?.type, "payload_too_large");
  }
});

function streamedRequest(contentLength?: string): Request {
  const headers = contentLength ? { "content-length": contentLength } : undefined;
  return new Request("http://localhost/api/v1/images/edits", {
    method: "POST",
    headers,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.enqueue(new Uint8Array([4, 5, 6]));
        controller.close();
      },
    }),
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

test("TC-MEDIA-BODY-SEC-002 actual streamed bytes defeat absent or understated Content-Length", async () => {
  for (const request of [streamedRequest(), streamedRequest("3")]) {
    await assert.rejects(
      () => readRequestBodyWithLimit(request, 5),
      (error: unknown) => error instanceof RequestBodyTooLargeError && error.limit === 5
    );
  }
});

test("TC-MEDIA-BODY-REG-003 under-limit media remains readable and adjacent provider routes stay non-media", async () => {
  const configuredLimit = getConfiguredBodySizeLimitBytes({ maxBodySizeMb: 10 });
  for (const pathname of [
    "/api/v1/providers/openai/chat/completions",
    "/api/v1/providers/openai/embeddings",
    "/api/v1/providers/openai/images/generations-extra",
  ]) {
    assert.equal(
      getBodySizeLimit(pathname, { maxBodySizeMb: 10 }),
      configuredLimit,
      `${pathname} must retain the normal configured non-media limit`
    );
  }

  const mediaLimit = assertFinitePositiveLimit("/api/v1/images/edits");
  assert.ok(mediaLimit > 4, "media limit must admit the four-byte compatibility body");
  const request = new Request("http://localhost/api/v1/images/edits", {
    method: "POST",
    body: new Uint8Array([1, 2, 3, 4]),
  });
  const body = await readRequestBodyWithLimit(request, mediaLimit);
  assert.deepEqual(body, new Uint8Array([1, 2, 3, 4]));

  assert.equal(
    getBodySizeLimit("/api/v1/providers/openai/images/generations", { maxBodySizeMb: 10 }),
    mediaLimit,
    "the intended provider image-generation matcher must receive the media limit"
  );
});
