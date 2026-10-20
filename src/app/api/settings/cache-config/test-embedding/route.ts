import { NextResponse } from "next/server";
import { isAuthenticated } from "@/shared/utils/apiAuth";
import { createDefaultEmbeddingGenerator } from "@agentproxy/open-sse/services/cache/embeddingClient.ts";
import { sanitizeErrorMessage } from "@agentproxy/open-sse/utils/error";
import { z } from "zod";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { resolveProviderConnectionDetails } from "@/lib/cache/semanticCacheDbBridge";
import { parseAndValidatePublicUrl } from "@/shared/network/outboundUrlGuard";

const testEmbeddingSchema = z.object({
  provider: z.string().trim().min(1),
  model: z.string().trim().min(1),
  baseUrl: z.string().trim().optional(),
  apiKey: z.string().trim().optional(),
  dimensions: z.number().int().positive().optional(),
});

export async function POST(request: Request) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validation = validateBody(testEmbeddingSchema, rawBody);
  if (isValidationFailure(validation)) {
    // `validateBody()` returns `{ success, error }` — there is no `.response`
    // (that shape belongs to `validatedJsonBody()`); returning `undefined` here
    // crashed the route on any invalid payload (TS2339 caught by api-typecheck).
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const { provider, model, baseUrl, apiKey, dimensions } = validation.data;

  // A caller-supplied endpoint is untrusted input: keep it public-only and never
  // pair it with a credential silently loaded from persistent provider state.
  if (baseUrl) {
    try {
      parseAndValidatePublicUrl(baseUrl);
    } catch {
      return NextResponse.json({
        ok: false,
        error: "Embedding base URL must be a safe public URL",
      });
    }
  }

  // Saved connection credentials may only travel to the saved connection endpoint.
  const conn = resolveProviderConnectionDetails(provider);
  const effectiveBaseUrl = baseUrl || conn.baseUrl;
  const effectiveApiKey = apiKey || (baseUrl ? undefined : conn.apiKey);

  try {
    const generator = createDefaultEmbeddingGenerator({
      embeddingProvider: provider,
      embeddingModel: model,
      embeddingBaseUrl: effectiveBaseUrl,
      embeddingApiKey: effectiveApiKey,
      embeddingDimension: dimensions,
    });

    const start = Date.now();
    const result = await generator("AgentProxy semantic cache live probe test");
    const latencyMs = Date.now() - start;

    if (!result || !Array.isArray(result.embedding)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to generate embedding (empty response or unsupported endpoint)",
        },
        { status: 200 }
      );
    }

    if (dimensions !== undefined && result.embedding.length !== dimensions) {
      return NextResponse.json({
        ok: false,
        error: `Embedding dimension mismatch: expected ${dimensions}, got ${result.embedding.length}`,
        dimensions: result.embedding.length,
      });
    }

    return NextResponse.json({
      ok: true,
      latencyMs,
      dimensions: result.embedding.length,
      resolvedBaseUrl: effectiveBaseUrl,
    });
  } catch (error: unknown) {
    const message = sanitizeErrorMessage(error);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 200 } // Return 200 with ok: false so the UI can display test error cleanly
    );
  }
}
