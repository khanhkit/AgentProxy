import { test } from "node:test";
import assert from "node:assert/strict";
import { OpencodeExecutor } from "../../open-sse/executors/opencode.ts";
import { runInOpencodeRequestContext } from "../../open-sse/executors/opencodeRequestContext.ts";

const RESPONSES_SSE =
  'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-1","object":"response","status":"completed","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"hi from responses"}]}]}}\n\n';
const CHAT_SSE =
  'data: {"id":"gen-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":null}]}\n\n' +
  'data: {"id":"gen-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n' +
  "data: [DONE]\n\n";
const READ_TOOL = { type: "function", function: { name: "read", parameters: { type: "object" } } };

async function exec(
  executor: OpencodeExecutor,
  model: string,
  body: object,
  stream: boolean,
  connectionId = "c"
): Promise<Response> {
  const result = (await executor.execute({
    model,
    body,
    stream,
    signal: null,
    credentials: { apiKey: "k", accessToken: null, connectionId },
    log: { debug() {}, info() {}, warn() {}, error() {} },
  })) as { response: Response };
  return result.response;
}

test("a request paused in credential refresh keeps its own target format", async () => {
  const originalFetch = globalThis.fetch;
  let releaseSlow!: () => void;
  let markSlowStarted!: () => void;
  const slowGate = new Promise<void>((resolve) => { releaseSlow = resolve; });
  const slowStarted = new Promise<void>((resolve) => { markSlowStarted = resolve; });

  class PausingExecutor extends OpencodeExecutor {
    override needsRefresh(credentials?: { connectionId?: string } | null): boolean {
      return credentials?.connectionId === "slow";
    }

    override async refreshCredentials(credentials: { connectionId?: string; apiKey?: string }) {
      if (credentials.connectionId === "slow") {
        markSlowStarted();
        await slowGate;
      }
      return { apiKey: credentials.apiKey ?? "k" };
    }
  }

  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    const isResponses = url.includes("/responses");
    return new Response(isResponses ? RESPONSES_SSE : CHAT_SSE, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  }) as typeof globalThis.fetch;

  try {
    const executor = new PausingExecutor("opencode-zen");
    const slow = exec(
      executor,
      "muse-spark-1.2-contributor-free",
      {
        model: "muse-spark-1.2-contributor-free",
        input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] }],
      },
      true,
      "slow"
    );
    await slowStarted;

    const quick = await exec(
      executor,
      "nemotron-3.5-lightning-free",
      {
        model: "nemotron-3.5-lightning-free",
        messages: [{ role: "user", content: "hi" }],
        tools: [READ_TOOL],
      },
      true,
      "quick"
    );
    await quick.body?.cancel();

    releaseSlow();
    const slowResponse = await slow;
    await slowResponse.body?.cancel();

    assert.equal(urls.length, 2);
    assert.match(urls[0], /\/chat\/completions(?:\?|$)/);
    assert.match(urls[1], /\/responses(?:\?|$)/);
  } finally {
    releaseSlow();
    globalThis.fetch = originalFetch;
  }
});

type Fields = { _requestFormat: string | null };
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("each in-flight request keeps its own target format", async () => {
  const executor = new OpencodeExecutor("opencode-zen") as unknown as Fields;
  const flow = (format: string) =>
    runInOpencodeRequestContext(async () => {
      executor._requestFormat = format;
      await tick();
      await tick();
      return executor._requestFormat;
    });
  const [a, b] = await Promise.all([flow("claude"), flow("openai-responses")]);
  assert.equal(a, "claude");
  assert.equal(b, "openai-responses");
});

test("a request ending does not clear another request's format", async () => {
  const executor = new OpencodeExecutor("opencode-zen") as unknown as Fields;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const slow = runInOpencodeRequestContext(async () => {
    executor._requestFormat = "openai-responses";
    await gate;
    return executor._requestFormat;
  });
  await runInOpencodeRequestContext(async () => {
    executor._requestFormat = "openai";
    executor._requestFormat = null;
  });
  release();
  assert.equal(await slow, "openai-responses");
});

test("outside execute the target format keeps the existing plain-field behavior", () => {
  const executor = new OpencodeExecutor("opencode-zen") as unknown as Fields;
  executor._requestFormat = "claude";
  runInOpencodeRequestContext(() => {
    executor._requestFormat = "openai";
  });
  assert.equal(executor._requestFormat, "claude");
});
