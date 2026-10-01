import test from "node:test";
import assert from "node:assert/strict";
import { FORMATS } from "../../open-sse/translator/formats.ts";
import { initState } from "../../open-sse/translator/index.ts";
import { openaiToOpenAIResponsesResponse } from "../../open-sse/translator/response/openai-responses.ts";
import { plaintextCollaborationFields } from "../../open-sse/translator/response/openai-responses/collaborationPlaintextMarker.ts";
import { translateNonStreamingClientResponse } from "../../open-sse/handlers/chatCore/nonStreamingClientTranslate.ts";
import { createResponsesApiTransformStream } from "../../open-sse/transformer/responsesTransformer.ts";

type Identity = { namespace: string; name: string };
const COLLAB_WIRE = "collaboration__spawn_agent";
const COLLAB_MAP = new Map<string, Identity>([
  [COLLAB_WIRE, { namespace: "collaboration", name: "spawn_agent" }],
]);

function streamingDoneItem(identityMap: Map<string, Identity>) {
  const state = initState(FORMATS.OPENAI_RESPONSES) as ReturnType<typeof initState> & {
    requestToolIdentityMap?: Map<string, Identity>;
  };
  state.requestToolIdentityMap = identityMap;
  const events = openaiToOpenAIResponsesResponse(
    {
      id: "chatcmpl-14154",
      model: "test-model",
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "call_spawn",
                type: "function",
                function: { name: COLLAB_WIRE, arguments: '{"message":"READY"}' },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    },
    state
  ) as Array<{ event: string; data: { item?: Record<string, unknown> } }>;
  const done = events.find((event) => event.event === "response.output_item.done");
  assert.ok(done?.data.item);
  return done.data.item;
}

async function transformerDoneItem(identityMap: Map<string, Identity>) {
  const stream = createResponsesApiTransformStream(null, 3000, {
    requestToolIdentityMap: identityMap,
  });
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const output: string[] = [];
  const readTask = (async () => {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      output.push(decoder.decode(value));
    }
  })();
  await writer.write(
    encoder.encode(
      `data: ${JSON.stringify({
        id: "chatcmpl-transformer-14154",
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call_spawn",
                  type: "function",
                  function: { name: COLLAB_WIRE, arguments: '{"message":"READY"}' },
                },
              ],
            },
          },
        ],
      })}\n\n`
    )
  );
  await writer.write(
    encoder.encode(
      'data: {"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n'
    )
  );
  await writer.close();
  await readTask;
  const frames = output.join("").split("\n\n").filter(Boolean);
  for (const frame of frames) {
    const event = frame.split("\n").find((line) => line === "event: response.output_item.done");
    if (!event) continue;
    const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));
    if (!dataLine) continue;
    return JSON.parse(dataLine.slice(6)).item as Record<string, unknown>;
  }
  throw new Error("response.output_item.done not found");
}

test("#14154: marker helper is exact and collaboration-only", () => {
  assert.deepEqual(plaintextCollaborationFields("collaboration", "spawn_agent"), {
    encrypted_function_args: [],
  });
  assert.deepEqual(plaintextCollaborationFields("collaboration", "send_message"), {
    encrypted_function_args: [],
  });
  assert.deepEqual(plaintextCollaborationFields("collaboration", "followup_task"), {
    encrypted_function_args: [],
  });
  assert.deepEqual(plaintextCollaborationFields("search", "spawn_agent"), {});
  assert.deepEqual(plaintextCollaborationFields(undefined, "spawn_agent"), {});
});

test("#14154: streaming Responses translator stamps plaintext collaboration marker", () => {
  const item = streamingDoneItem(COLLAB_MAP);
  assert.equal(item.namespace, "collaboration");
  assert.equal(item.name, "spawn_agent");
  assert.deepEqual(item.encrypted_function_args, []);
});

test("#14154: non-streaming Responses translator stamps plaintext collaboration marker", () => {
  const result = translateNonStreamingClientResponse({
    responseBody: {
      id: "resp-14154",
      object: "response",
      output: [
        {
          type: "function_call",
          name: COLLAB_WIRE,
          arguments: '{"message":"READY"}',
          call_id: "call_spawn",
        },
      ],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    },
    responsePayloadFormat: FORMATS.OPENAI_RESPONSES,
    clientResponseFormat: FORMATS.OPENAI_RESPONSES,
    sourceFormat: FORMATS.OPENAI_RESPONSES,
    provider: "openai",
    model: "test-model",
    requestBody: {},
    responseToolNameMap: null,
    customToolNames: new Set<string>(),
    requestToolIdentityMap: COLLAB_MAP,
    reasoningCacheScope: null,
    clientHeaders: null,
    isClaudeCodeCompatible: false,
    phase: "final",
  });
  const item = (result.response.output as Array<Record<string, unknown>>)[0];
  assert.equal(item.namespace, "collaboration");
  assert.equal(item.name, "spawn_agent");
  assert.deepEqual(item.encrypted_function_args, []);
});

test("#14154: generic Responses transformer restores identity and marker", async () => {
  const item = await transformerDoneItem(COLLAB_MAP);
  assert.equal(item.namespace, "collaboration");
  assert.equal(item.name, "spawn_agent");
  assert.deepEqual(item.encrypted_function_args, []);
});

test("#14154: non-collaboration calls never get encrypted_function_args", () => {
  const map = new Map<string, Identity>([["search__web_search", { namespace: "search", name: "web_search" }]]);
  const item = streamingDoneItem(map);
  // The helper is the policy boundary; unrelated namespaces remain untouched.
  assert.equal(plaintextCollaborationFields("search", "web_search").encrypted_function_args, undefined);
  assert.equal(item.encrypted_function_args, undefined);
});
