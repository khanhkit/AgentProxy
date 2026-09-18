import test from "node:test";
import assert from "node:assert/strict";

const reverseProxy = await import("../../src/lib/services/reverseProxy.ts");

function byteStream(chunks: string[], onCancel?: (reason: unknown) => void): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[index++]));
    },
    cancel(reason) {
      onCancel?.(reason);
    },
  });
}

test("readHtmlResponseWithLimit returns normal HTML within the byte budget", async () => {
  const html = "<html>ok</html>";
  const response = new Response(byteStream([html]), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-length": String(Buffer.byteLength(html, "utf8")),
    },
  });

  assert.equal(await reverseProxy.readHtmlResponseWithLimit(response, 1024), html);
});

test("readHtmlResponseWithLimit rejects declared oversized HTML before consuming it", async () => {
  let cancelled = false;
  const response = new Response(
    byteStream(["body-should-not-be-consumed"], () => {
      cancelled = true;
    }),
    { headers: { "content-length": "9" } }
  );

  await assert.rejects(
    reverseProxy.readHtmlResponseWithLimit(response, 8),
    /HTML response exceeds 8 bytes/
  );
  assert.equal(cancelled, true, "declared oversized bodies should be cancelled immediately");
});

test("readHtmlResponseWithLimit rejects chunked HTML as soon as streamed bytes exceed the cap", async () => {
  let cancelReason = "";
  const response = new Response(
    byteStream(["12345", "67890", "never-read"], (reason) => {
      cancelReason = String(reason);
    })
  );

  await assert.rejects(
    reverseProxy.readHtmlResponseWithLimit(response, 8),
    /HTML response exceeds 8 bytes/
  );
  assert.match(cancelReason, /HTML response size limit exceeded/);
});

test("readHtmlResponseWithLimit measures UTF-8 bytes rather than JavaScript characters", async () => {
  const response = new Response(byteStream(["ééé"]));
  await assert.rejects(
    reverseProxy.readHtmlResponseWithLimit(response, 5),
    /HTML response exceeds 5 bytes/
  );
});
