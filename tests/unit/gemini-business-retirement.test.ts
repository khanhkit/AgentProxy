import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const { REGISTRY } = await import("../../open-sse/config/providers/index.ts");
const { WEB_COOKIE_PROVIDERS } = await import("../../src/shared/constants/providers/web-cookie.ts");
const { WEB_SESSION_CREDENTIAL_REQUIREMENTS } =
  await import("../../src/shared/providers/webSessionCredentials.ts");
const { hasSpecializedExecutor } = await import("../../open-sse/executors/index.ts");

test("retired gemini-business provider and gembiz alias are absent from runtime registries", () => {
  assert.equal(REGISTRY["gemini-business"], undefined);
  assert.equal(WEB_COOKIE_PROVIDERS["gemini-business"], undefined);
  assert.equal(WEB_SESSION_CREDENTIAL_REQUIREMENTS["gemini-business"], undefined);

  assert.equal(hasSpecializedExecutor("gemini-business"), false);
  assert.equal(hasSpecializedExecutor("gembiz"), false);
});

test("retired gemini-business executor and provider registry module are absent", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "../..");
  assert.equal(
    fs.existsSync(path.join(root, "open-sse/executors/gemini-business.ts")),
    false
  );
  assert.equal(
    fs.existsSync(
      path.join(root, "open-sse/config/providers/registry/gemini/business/index.ts")
    ),
    false
  );
});
