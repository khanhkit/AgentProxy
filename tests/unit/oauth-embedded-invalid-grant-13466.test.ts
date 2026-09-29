import test from "node:test";
import assert from "node:assert/strict";

import { rotationGroupFor } from "../../open-sse/services/refreshSerializer.ts";
import { extractOAuthErrorCode } from "../../open-sse/services/tokenRefresh/shared.ts";

test("embedded invalid_grant in provider error text is unrecoverable", () => {
  assert.equal(
    extractOAuthErrorCode({ error: "failed to refresh token: invalid_grant" }),
    "invalid_grant"
  );
  assert.equal(extractOAuthErrorCode("xinvalid_grant"), null);
  assert.equal(extractOAuthErrorCode("my_invalid_grant_flag"), null);
});

test("cline refreshes share a serialized rotation lane", () => {
  assert.equal(rotationGroupFor("cline"), "cline");
});
