import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTokenPlanCatalogRequest,
  discoverTokenPlanModels,
  isTokenPlanCatalogProvider,
  parseTokenPlanCatalog,
} from "../../src/lib/providerModels/tokenPlanModelDiscovery.ts";

function envelope(ids: unknown[]) {
  return {
    code: "200",
    data: {
      success: true,
      DataV2: {
        data: {
          code: "200",
          success: true,
          data: ids,
        },
      },
    },
  };
}

test("Token Plan discovery uses regional public gateways without forwarding credentials", () => {
  for (const provider of ["qwen-cloud-token-plan", "bailian-coding-plan"]) {
    for (const region of ["global-sg", "china-beijing"]) {
      const request = buildTokenPlanCatalogRequest(provider, {
        region,
        apiKey: "secret-key",
        cookie: "secret-cookie",
        baseUrl: "http://127.0.0.1/private",
      });
      const expectedHost =
        region === "china-beijing"
          ? "cs-data.qianwenai.com"
          : provider === "bailian-coding-plan"
            ? "bailian-singapore-cs.alibabacloud.com"
            : "cs-data.qwencloud.com";

      assert.equal(new URL(request.url).hostname, expectedHost);
      assert.equal(request.init.method, "POST");
      assert.equal(JSON.stringify(request).includes("secret"), false);
      const data = JSON.parse(new URLSearchParams(request.init.body).get("params")!).Data;
      assert.equal(data.edition, "PERSONAL");
    }
  }

  assert.equal(isTokenPlanCatalogProvider("qwen-cloud"), false);
  assert.equal(isTokenPlanCatalogProvider("alibaba"), false);
  assert.throws(() => buildTokenPlanCatalogRequest("alibaba"));
});

test("live IDs survive without a static allowlist while media and duplicates are excluded", () => {
  const models = parseTokenPlanCatalog(
    envelope([
      "qwen3.8-flash",
      "deepseek-v4-pro-0813",
      "glm-5.2",
      "qwen-future-model",
      "qwen3.8-flash",
      "qwen-image-3.0-pro",
      "wan2.7-image",
      "happyhorse-1.1-i2v",
      "qwen-audio-3.0-asr-flash",
      "qwen-audio-3.0-realtime-plus",
      "qwen-audio-3.0-tts-plus",
    ])
  );

  assert.deepEqual(
    models.map(({ id }) => id),
    ["qwen3.8-flash", "deepseek-v4-pro-0813", "glm-5.2", "qwen-future-model"]
  );
});

test("HTTP-success gateway errors and unusable catalogs cannot replace a cached list", () => {
  for (const payload of [
    { code: "200", data: { success: false, errorCode: "LoginRequired" } },
    envelope([]),
    envelope(["qwen-image-3.0-pro"]),
    envelope([null]),
    envelope(["qwen-valid", "../bad"]),
    "<html>login</html>",
  ]) {
    assert.throws(() => parseTokenPlanCatalog(payload));
  }
});

test("live Token Plan discovery uses public-only safe-fetch policy and preserves proxy routing", async () => {
  const proxyConfig = { id: "proxy-a" };
  let seenUrl = "";
  let seenOptions: Record<string, unknown> = {};

  const models = await discoverTokenPlanModels(
    "qwen-cloud-token-plan",
    { region: "global-sg", apiKey: "secret-key", cookie: "secret-cookie" },
    proxyConfig,
    async (url, options) => {
      seenUrl = String(url);
      seenOptions = options as Record<string, unknown>;
      return new Response(JSON.stringify(envelope(["qwen3.8-flash"])), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
  );

  assert.equal(new URL(seenUrl).hostname, "cs-data.qwencloud.com");
  assert.equal(seenOptions.guard, "public-only");
  assert.equal(seenOptions.proxyConfig, proxyConfig);
  assert.equal(JSON.stringify({ seenUrl, seenOptions }).includes("secret"), false);
  assert.deepEqual(models, [{ id: "qwen3.8-flash", name: "qwen3.8-flash" }]);
});

test("live Token Plan discovery fails closed on non-success HTTP responses", async () => {
  await assert.rejects(
    () =>
      discoverTokenPlanModels(
        "bailian-coding-plan",
        { region: "global-sg" },
        undefined,
        async () => new Response("upstream failed", { status: 503 })
      ),
    /Token Plan catalog request failed/
  );
});
