import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Buffer } from "node:buffer";
import type { Page } from "playwright";

const packageBrowserPool = await import("../../packages/browser-pool/src/services/browserPool.ts");
const openSseBrowserPool = await import("../../open-sse/services/browserPool.ts");

type CaptureResult = {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  tooLarge: boolean;
};

type CaptureHandle = {
  result: Promise<CaptureResult>;
  dispose: () => Promise<void>;
};

type CaptureFactory = (
  page: Page,
  matches: (url: string, method: string) => boolean,
  maxBytes: number,
  options?: { timeoutMs?: number; signal?: AbortSignal | null }
) => Promise<CaptureHandle>;

const implementations: Array<[string, CaptureFactory | undefined]> = [
  [
    "browser-pool package",
    (packageBrowserPool as unknown as { startBoundedPageResponseCapture?: CaptureFactory })
      .startBoundedPageResponseCapture,
  ],
  [
    "open-sse runtime",
    (openSseBrowserPool as unknown as { startBoundedPageResponseCapture?: CaptureFactory })
      .startBoundedPageResponseCapture,
  ],
];

interface ReadChunk {
  data: string;
  base64Encoded?: boolean;
  eof: boolean;
}

class FakeCdpSession extends EventEmitter {
  readonly commands: Array<{ method: string; params: Record<string, unknown> | undefined }> = [];
  readonly reads: ReadChunk[];
  detached = false;

  constructor(reads: ReadChunk[] = []) {
    super();
    this.reads = [...reads];
  }

  async send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    this.commands.push({ method, params });
    switch (method) {
      case "Fetch.takeResponseBodyAsStream":
        return { stream: "stream-1" };
      case "IO.read":
        return this.reads.shift() ?? { data: "", eof: true };
      default:
        return {};
    }
  }

  async detach(): Promise<void> {
    this.detached = true;
  }
}

function fakePage(session: FakeCdpSession): Page {
  return {
    context: () => ({ newCDPSession: async () => session }),
  } as unknown as Page;
}

function emitPausedResponse(
  session: FakeCdpSession,
  options: {
    requestId?: string;
    url?: string;
    method?: string;
    status?: number;
    headers?: Array<{ name: string; value: string }>;
  } = {}
): void {
  session.emit("Fetch.requestPaused", {
    requestId: options.requestId ?? "target-1",
    request: {
      url: options.url ?? "https://chat.example/api/chat",
      method: options.method ?? "POST",
    },
    responseStatusCode: options.status ?? 200,
    responseStatusText: "OK",
    responseHeaders: options.headers ?? [{ name: "content-type", value: "text/plain" }],
  });
}

function commandCount(session: FakeCdpSession, method: string): number {
  return session.commands.filter((entry) => entry.method === method).length;
}

function lastCommand(session: FakeCdpSession, method: string) {
  return session.commands.filter((entry) => entry.method === method).at(-1);
}

test("both browser-pool paths expose the response-stage streaming primitive", () => {
  for (const [name, factory] of implementations) {
    assert.equal(typeof factory, "function", `${name} must expose bounded response capture`);
  }
});

for (const [name, factory] of implementations) {
  test(`${name}: chunked oversized response is failed before a full body can be accumulated`, async () => {
    assert.ok(factory);
    const session = new FakeCdpSession([
      { data: Buffer.from("12345678").toString("base64"), base64Encoded: true, eof: false },
      { data: Buffer.from("ABCDEFGH").toString("base64"), base64Encoded: true, eof: true },
    ]);
    const handle = await factory(
      fakePage(session),
      (url, method) => method === "POST" && url.endsWith("/api/chat"),
      10,
      { timeoutMs: 1000 }
    );

    emitPausedResponse(session);
    const result = await handle.result;

    assert.equal(result.tooLarge, true);
    assert.equal(result.body.length, 0, "oversized capture must not retain a partial body");
    assert.equal(commandCount(session, "Fetch.failRequest"), 1);
    assert.equal(commandCount(session, "Fetch.fulfillRequest"), 0);
    assert.equal(commandCount(session, "IO.read"), 2);
    await handle.dispose();
  });

  test(`${name}: false-small Content-Length cannot bypass the streamed byte limit`, async () => {
    assert.ok(factory);
    const session = new FakeCdpSession([
      { data: Buffer.from("12345678").toString("base64"), base64Encoded: true, eof: false },
      { data: Buffer.from("ABCDEFGH").toString("base64"), base64Encoded: true, eof: true },
    ]);
    const handle = await factory(fakePage(session), () => true, 10, { timeoutMs: 1000 });

    emitPausedResponse(session, {
      headers: [
        { name: "content-type", value: "text/plain" },
        { name: "content-length", value: "1" },
      ],
    });
    const result = await handle.result;

    assert.equal(result.tooLarge, true);
    assert.equal(commandCount(session, "Fetch.failRequest"), 1);
    assert.equal(commandCount(session, "Fetch.fulfillRequest"), 0);
    await handle.dispose();
  });

  test(`${name}: normal bounded response is fulfilled back to the page and returned to caller`, async () => {
    assert.ok(factory);
    const session = new FakeCdpSession([
      { data: Buffer.from("hello").toString("base64"), base64Encoded: true, eof: true },
    ]);
    const handle = await factory(fakePage(session), () => true, 10, { timeoutMs: 1000 });

    emitPausedResponse(session, { status: 201 });
    const result = await handle.result;

    assert.equal(result.tooLarge, false);
    assert.equal(result.status, 201);
    assert.equal(result.body.toString(), "hello");
    assert.equal(commandCount(session, "Fetch.failRequest"), 0);
    assert.equal(commandCount(session, "Fetch.fulfillRequest"), 1);
    assert.equal(
      lastCommand(session, "Fetch.fulfillRequest")?.params?.body,
      Buffer.from("hello").toString("base64")
    );
    await handle.dispose();
  });

  test(`${name}: unrelated paused responses continue without being buffered`, async () => {
    assert.ok(factory);
    const session = new FakeCdpSession([
      { data: Buffer.from("ok").toString("base64"), base64Encoded: true, eof: true },
    ]);
    const handle = await factory(
      fakePage(session),
      (url, method) => method === "POST" && url.endsWith("/api/chat"),
      10,
      { timeoutMs: 1000 }
    );

    emitPausedResponse(session, {
      requestId: "unrelated",
      url: "https://chat.example/assets/poll",
      method: "GET",
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(commandCount(session, "Fetch.continueResponse"), 1);
    assert.equal(commandCount(session, "IO.read"), 0);

    emitPausedResponse(session);
    const result = await handle.result;
    assert.equal(result.body.toString(), "ok");
    await handle.dispose();
  });
}

for (const [name, factory] of implementations) {
  test(`${name}: declared oversized response is rejected before opening a body stream`, async () => {
    assert.ok(factory);
    const session = new FakeCdpSession();
    const handle = await factory(fakePage(session), () => true, 10, { timeoutMs: 1000 });

    emitPausedResponse(session, {
      headers: [
        { name: "content-type", value: "application/json" },
        { name: "content-length", value: "11" },
      ],
    });
    const result = await handle.result;

    assert.equal(result.tooLarge, true);
    assert.equal(result.body.length, 0);
    assert.equal(commandCount(session, "Fetch.takeResponseBodyAsStream"), 0);
    assert.equal(commandCount(session, "IO.read"), 0);
    assert.equal(commandCount(session, "Fetch.failRequest"), 1);
    await handle.dispose();
  });

  test(`${name}: caller abort tears down interception without leaking the CDP session`, async () => {
    assert.ok(factory);
    const controller = new AbortController();
    const session = new FakeCdpSession();
    const handle = await factory(fakePage(session), () => true, 10, {
      timeoutMs: 1000,
      signal: controller.signal,
    });

    controller.abort();
    await assert.rejects(handle.result, (error: unknown) => {
      assert.ok(error instanceof DOMException);
      assert.equal(error.name, "AbortError");
      return true;
    });

    assert.equal(commandCount(session, "Fetch.disable"), 1);
    assert.equal(session.detached, true);
    assert.equal(commandCount(session, "IO.read"), 0);
    await handle.dispose();
  });
}
