import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { stripTrailingSlashes } from "../../../open-sse/utils/urlSanitize.ts";

const TARGETS = [
  {
    file: "open-sse/services/tokenRefresh/providers/copilot.ts",
    importPattern:
      /import \{ stripTrailingSlashes \} from "\.\.\/\.\.\/\.\.\/utils\/urlSanitize\.ts";/,
  },
  {
    file: "src/sse/services/tokenRefresh.ts",
    importPattern:
      /import \{ stripTrailingSlashes \} from "@omniroute\/open-sse\/utils\/urlSanitize\.ts";/,
  },
  {
    file: "src/lib/oauth/providers/ghe-copilot.ts",
    importPattern:
      /import \{ stripTrailingSlashes \} from "@omniroute\/open-sse\/utils\/urlSanitize\.ts";/,
  },
];

test("AP-0115 shared helper preserves trailing-slash normalization semantics", () => {
  assert.equal(stripTrailingSlashes("https://ghe.example.com"), "https://ghe.example.com");
  assert.equal(stripTrailingSlashes("https://ghe.example.com/"), "https://ghe.example.com");
  assert.equal(stripTrailingSlashes("https://ghe.example.com////"), "https://ghe.example.com");
  assert.equal(stripTrailingSlashes("////"), "");
});

test("AP-0115 helper handles adversarial long inputs without regex backtracking", () => {
  const nonMatchingSuffix = "/".repeat(250_000) + "x";
  assert.equal(stripTrailingSlashes(nonMatchingSuffix), nonMatchingSuffix);

  const trailingRun = "https://ghe.example.com" + "/".repeat(250_000);
  assert.equal(stripTrailingSlashes(trailingRun), "https://ghe.example.com");
});

test("AP-0115 all GHE normalization call sites use the shared linear helper", () => {
  for (const { file, importPattern } of TARGETS) {
    const source = readFileSync(file, "utf8");
    assert.match(source, importPattern, `${file} must import the shared urlSanitize authority`);
    assert.equal(
      source.includes('replace(/\\/+$/, "")'),
      false,
      `${file} must not use the superlinear trailing-slash regex`
    );
  }
});
