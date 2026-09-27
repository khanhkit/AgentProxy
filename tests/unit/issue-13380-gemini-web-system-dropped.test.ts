import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const { buildGeminiPrompt, buildGeminiToolPrompt } =
  await import("../../open-sse/executors/gemini-web.ts");
const { prepareToolMessages } = await import("../../open-sse/translator/webTools.ts");

test("single-turn system + user retains both contents", () => {
  const prompt = buildGeminiPrompt([
    { role: "system", content: "SYSTEM_SENTINEL\nSECOND_SYSTEM_LINE" },
    { role: "user", content: "USER_SENTINEL" },
  ]);
  assert.ok(prompt.includes("SYSTEM_SENTINEL"));
  assert.ok(prompt.includes("USER_SENTINEL"));
});

test("single-turn request without system remains byte-identical", () => {
  assert.equal(
    buildGeminiPrompt([{ role: "user", content: "JUST_THE_USER_MESSAGE" }]),
    "JUST_THE_USER_MESSAGE"
  );
});

test("tool request keeps both client system text and appended tool contract", () => {
  const body = {
    tools: [{
      type: "function",
      function: {
        name: "ping",
        description: "Return a ping",
        parameters: { type: "object", properties: {} },
      },
    }],
  };
  const messages = [
    { role: "system", content: "CLIENT_SYSTEM_SENTINEL" },
    { role: "user", content: "USER_SENTINEL" },
  ];

  const { effectiveMessages } = prepareToolMessages(body, messages);
  const prompt = buildGeminiToolPrompt(effectiveMessages);
  assert.ok(prompt.includes("CLIENT_SYSTEM_SENTINEL"));
  assert.ok(prompt.includes("Return a ping"));
  assert.ok(prompt.includes("USER_SENTINEL"));
});

test("tool request preserves client-system before synthetic contract", () => {
  const body = {
    tools: [{
      type: "function",
      function: {
        name: "ping",
        description: "TOOL_CONTRACT_SENTINEL",
        parameters: { type: "object", properties: {} },
      },
    }],
  };
  const messages = [
    { role: "system", content: "CLIENT_SYSTEM_SENTINEL" },
    { role: "user", content: "USER_SENTINEL" },
  ];
  const { effectiveMessages } = prepareToolMessages(body, messages);
  const prompt = buildGeminiToolPrompt(effectiveMessages);

  const client = prompt.indexOf("CLIENT_SYSTEM_SENTINEL");
  const contract = prompt.indexOf("TOOL_CONTRACT_SENTINEL");
  assert.ok(client >= 0);
  assert.ok(contract >= 0);
  assert.ok(client < contract);
});

test("multiline prompt uses atomic insertText before the explicit Enter", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "open-sse/executors/gemini-web.ts"),
    "utf8"
  );
  assert.ok(source.includes("await page.keyboard.insertText(prompt)"));
  assert.equal(source.includes("page.keyboard.type(prompt"), false);
});
