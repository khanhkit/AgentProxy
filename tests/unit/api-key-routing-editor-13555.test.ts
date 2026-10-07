import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

test("#13555 dedicated routing page scopes the existing editor by apiKeyId", () => {
  const page = read("src/app/(dashboard)/dashboard/api-manager/routing/RoutingPageClient.tsx");
  assert.match(page, /searchParams\.get\("apiKeyId"\)/);
  assert.match(page, /<ReasoningRoutingRules[^>]*initialApiKeyId=\{apiKeyId\}/);
  assert.match(page, /href="\/dashboard\/api-manager"/);
});

test("#13555 entry link preserves an API-key deep link", () => {
  const link = read("src/shared/components/routing/RoutingEntryLink.tsx");
  assert.match(link, /encodeURIComponent\(normalized\)/);
  assert.match(link, /\/dashboard\/api-manager\/routing\?apiKeyId=/);
  assert.match(link, /useTranslations\("reasoningRouting"\)/);
});

test("#13555 API manager and settings route to the dedicated editor instead of embedding it", () => {
  const manager = read("src/app/(dashboard)/dashboard/api-manager/ApiManagerPageClient.tsx");
  const settings = read("src/app/(dashboard)/dashboard/settings/routing/page.tsx");

  assert.match(manager, /<RoutingEntryLink \/>/);
  assert.match(manager, /<RoutingEntryLink apiKeyId=\{apiKey\.id\} \/>/);
  assert.doesNotMatch(manager, /<ReasoningRoutingRules/);

  assert.match(settings, /<RoutingEntryLink \/>/);
  assert.doesNotMatch(settings, /<ReasoningRoutingRules/);
});

test("#13555 keeps the mature ReasoningRoutingRules implementation as the editor engine", () => {
  const rules = read("src/shared/components/ReasoningRoutingRules.tsx");
  assert.match(rules, /initialApiKeyId/);
  assert.match(rules, /rule\.scope !== "apiKey" \|\| rule\.apiKeyId !== apiKeyId/);
  assert.match(rules, /const dirty = JSON\.stringify\(form\) !== baseline/);
});
