import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DevinCliAgenticExecutor } from "../../open-sse/executors/devin-cli-agentic.ts";
import { extractBareSummaryEnvelope } from "../../open-sse/executors/devin-agentic/toolParser.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FAKE_BIN = path.join(__dirname, "fake-devin-acp-summarizer.mjs");

test("devin-cli-agentic never forwards a bare summary envelope", async () => {
  const sandboxHome = fs.mkdtempSync(path.join(os.tmpdir(), "devin-agentic-"));
  const home = path.join(sandboxHome, ".sandbox", "home");
  fs.mkdirSync(home, { recursive: true });
  const previousBin = process.env.CLI_DEVIN_AGENTIC_BIN;
  const previousHome = process.env.DEVIN_AGENTIC_HOME;
  process.env.CLI_DEVIN_AGENTIC_BIN = FAKE_BIN;
  process.env.DEVIN_AGENTIC_HOME = home;

  try {
    const executor = new DevinCliAgenticExecutor();
    const result = await executor.execute({
      model: "claude-sonnet-4-6",
      stream: false,
      credentials: {},
      body: {
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [{ role: "user", content: "Look up the record for me." }],
        tools: [{
          name: "lookup",
          description: "Look up a record",
          input_schema: { type: "object", properties: {}, additionalProperties: false },
        }],
      },
    });
    assert.equal(result.response.status, 200);
    const payload = await result.response.json();
    const textBlock = (payload.content || []).find(
      (block: { type?: string }) => block.type === "text"
    );
    assert.ok(textBlock);
    const finalText: string = textBlock.text;
    assert.equal(/<summary>/i.test(finalText), false);
    assert.ok(finalText.includes("Lookup finished and the record was located."));
  } finally {
    if (previousBin === undefined) delete process.env.CLI_DEVIN_AGENTIC_BIN;
    else process.env.CLI_DEVIN_AGENTIC_BIN = previousBin;
    if (previousHome === undefined) delete process.env.DEVIN_AGENTIC_HOME;
    else process.env.DEVIN_AGENTIC_HOME = previousHome;
    fs.rmSync(sandboxHome, { recursive: true, force: true });
  }
});

test("extractBareSummaryEnvelope only matches a whole-string wrapper", () => {
  assert.equal(extractBareSummaryEnvelope("<summary>inner text</summary>"), "inner text");
  assert.equal(extractBareSummaryEnvelope("  <summary>\ninner text\n</summary>  "), "inner text");
  assert.equal(extractBareSummaryEnvelope("Here is a summary of what I did."), null);
  assert.equal(
    extractBareSummaryEnvelope("<summary>partial</summary>\nSome trailing narrative."),
    null
  );
});
