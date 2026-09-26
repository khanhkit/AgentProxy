import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { OpencodeExecutor } from "../../open-sse/executors/opencode.ts";

describe("AP-ISS-0124 OpenCode stream_options", () => {
  for (const provider of ["opencode-go", "opencode-zen"]) {
    for (const stream of [false, undefined, true]) {
      it(`${provider}: only streaming Chat Completions retains stream_options (${stream})`, () => {
        const executor = new OpencodeExecutor(provider);
        executor._requestFormat = "openai";
        const body = {
          model: "deepseek-v4.1-flash",
          messages: [{ role: "user", content: "hello" }],
          ...(stream === undefined ? {} : { stream }),
          stream_options: { include_usage: true },
        };
        const original = structuredClone(body);
        const outgoing = executor.transformRequest(body.model, body, stream === true, {});
        assert.equal(Object.hasOwn(outgoing, "stream_options"), stream === true);
        if (stream) assert.deepEqual(outgoing.stream_options, { include_usage: true });
        assert.deepEqual(body, original);
      });
    }
  }

  for (const format of ["claude", "openai-responses"]) {
    it(`strips Chat Completions stream_options for ${format}`, () => {
      const executor = new OpencodeExecutor("opencode-zen");
      executor._requestFormat = format;
      const body = {
        model: "test-model",
        stream: true,
        stream_options: { include_usage: true },
      };
      const outgoing = executor.transformRequest(body.model, body, true, {});
      assert.equal(Object.hasOwn(outgoing, "stream_options"), false);
      assert.deepEqual(body.stream_options, { include_usage: true });
    });
  }

  it("resolves Chat Completions format when transformRequest runs without execute", () => {
    const executor = new OpencodeExecutor("opencode-go");
    const body = {
      model: "deepseek-v4.1-flash",
      stream: true,
      stream_options: { include_usage: true },
    };
    assert.deepEqual(
      executor.transformRequest(body.model, body, true, {}).stream_options,
      body.stream_options
    );
  });
});
