import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDeepSeekToolCalls } from "../../open-sse/translator/deepseekWebTools.ts";

const WRITE_TOOL = [
  {
    type: "function",
    function: { name: "write", parameters: { properties: { file_path: {}, content: {} } } },
  },
];

test("deepseek-web DSML invoke markup resolves into a write call", () => {
  const raw =
    '<｜｜DSML｜｜ calls> <｜｜DSML｜｜ invoke name="write"> ' +
    '<｜｜DSML｜｜ parameter name="file_path" string="true">D:\\Projects\\demo.txt</｜｜DSML｜｜ parameter> ' +
    '<｜｜DSML｜｜ parameter name="content" string="true">hello</｜｜DSML｜｜ parameter> ' +
    '</｜｜DSML｜｜ invoke> </｜｜DSML｜｜ calls>';

  const { content, toolCalls } = parseDeepSeekToolCalls(raw, "call", WRITE_TOOL);
  assert.ok(toolCalls);
  assert.equal(toolCalls.length, 1);
  assert.equal(toolCalls[0].function.name, "write");
  assert.deepEqual(JSON.parse(toolCalls[0].function.arguments), {
    file_path: "D:\\Projects\\demo.txt",
    content: "hello",
  });
  assert.ok(!content.includes("DSML"));
});

test("deepseek-web single-pipe defensive DSML invoke variant also resolves", () => {
  const raw =
    '<｜DSML｜ calls> <｜DSML｜ invoke name="write"> ' +
    '<｜DSML｜ parameter name="file_path">notes.txt</｜DSML｜ parameter> ' +
    '<｜DSML｜ parameter name="content">hello</｜DSML｜ parameter> ' +
    '</｜DSML｜ invoke> </｜DSML｜ calls>';

  const { toolCalls } = parseDeepSeekToolCalls(raw, "call", WRITE_TOOL);
  assert.ok(toolCalls);
  assert.equal(toolCalls[0].function.name, "write");
});
