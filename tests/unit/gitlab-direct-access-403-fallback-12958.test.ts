import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { shouldFallbackToPublicCodeSuggestions } from "../../src/lib/oauth/gitlab.ts";

test("all GitLab direct_access 403 responses fall back to public Code Suggestions", () => {
  assert.equal(shouldFallbackToPublicCodeSuggestions(401, "{}"), true);
  assert.equal(
    shouldFallbackToPublicCodeSuggestions(403, '{"error":"direct connections are disabled"}'),
    true
  );
  assert.equal(
    shouldFallbackToPublicCodeSuggestions(403, '{"error":"insufficient_scope"}'),
    true
  );
  assert.equal(shouldFallbackToPublicCodeSuggestions(400, '{"error":"bad_request"}'), false);
});

test("GitLab executor no longer hard-fails a generic direct_access 403", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "open-sse/executors/gitlab.ts"),
    "utf8"
  );

  assert.doesNotMatch(
    source,
    /response\.status === 403 && !isGitLabDirectAccessDisabled\(response\.status, bodyText\)/
  );
  assert.doesNotMatch(source, /GitLab Duo direct access scope is unavailable/);
  assert.match(source, /response\.status === 403 && input\.log/);
});
