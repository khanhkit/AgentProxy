import test from "node:test";
import assert from "node:assert/strict";
import { cleanResponse } from "../../open-sse/executors/perplexity-web/protocol.ts";

test("cleanResponse preserves code indentation while stripping citations", () => {
  assert.equal(
    cleanResponse("if (ready) {\n    run();\n}", true),
    "if (ready) {\n    run();\n}"
  );
  assert.equal(cleanResponse("text [1] more", true), "text more");
});
