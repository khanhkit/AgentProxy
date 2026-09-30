import assert from "node:assert/strict";
import test from "node:test";

import {
  FREE_MODEL_BUDGETS,
  computeFreeModelTotals,
} from "../../open-sse/config/freeModelCatalog.ts";
import { APIKEY_PROVIDERS_INFERENCE } from "../../src/shared/constants/providers/apikey/inference-hosts.ts";

test("Together remains prepaid-only and has no free-tier catalog entry", () => {
  const together = APIKEY_PROVIDERS_INFERENCE.together;
  assert.equal(together.hasFree, false);
  assert.match(together.notice.text, /prepaid|\$5/i);
  assert.match(together.notice.text, /\$25 signup credit was retired/i);
  assert.equal(
    FREE_MODEL_BUDGETS.some((row) => row.provider === "together"),
    false
  );
});

test("removing the retired Together credit keeps the live free-tier totals coherent", () => {
  const totals = computeFreeModelTotals();
  assert.equal(totals.modelCount, 485);
  assert.equal(totals.firstMonthRealisticTokens, 2_224_725_000);
  assert.match(totals.headline, /~2\.22B in your first month/);
});
