import test from "node:test";
import assert from "node:assert/strict";

import { selectAntigravityQuotaWindowNames } from "../../open-sse/services/antigravityQuotaFamily.ts";

test("public Gemini Flash scopes to the matching technical tiered quota window", () => {
  assert.deepEqual(
    selectAntigravityQuotaWindowNames(
      ["gemini-3.8-flash-tiered", "gemini-pro-agent"],
      "antigravity/gemini-3.8-flash"
    ),
    ["gemini-3.8-flash-tiered"]
  );
});

test("an exact public Flash quota window still wins over the technical tiered alias", () => {
  assert.deepEqual(
    selectAntigravityQuotaWindowNames(
      ["gemini-3.8-flash", "gemini-3.8-flash-tiered", "gemini_weekly"],
      "antigravity/gemini-3.8-flash"
    ),
    ["gemini-3.8-flash", "gemini_weekly"]
  );
});
