import * as yaml from "js-yaml";
import { safeOutboundFetch } from "@/shared/network/safeOutboundFetch";
import { getProviderOutboundGuard } from "@/shared/network/outboundUrlGuardPolicy";
import { openaiToClaudeRequest } from "../translator/request/openai-to-claude.ts";
import { translateNonStreamingResponse } from "../handlers/responseTranslator.ts";
import { FORMATS } from "../translator/formats.ts";
import { createSSETransformStreamWithLogger } from "../utils/stream.ts";

export type ProviderKind = "openai" | "anthropic" | "local";

export interface ProviderConfig {
  id: string;
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  /** API key is runtime-only and is never returned by public helpers. */
  apiKey?: string;
}

export interface ChatRequest {
  messages: Array<Record<string, unknown>>;
  model?: string;
  stream?: boolean;
  [key: string]: unknown;
}

export interface ProviderAdapter {
  readonly kind: ProviderKind;
  complete(
    request: ChatRequest,
    config: ProviderConfig,
    fetchImpl?: typeof fetch
  ): Promise<Response>;
}

const trimUrl = (url: string): string => url.replace(/\/+$/, "");

function authHeaders(config: ProviderConfig): Record<string, string> {
  return config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {};
}

function providerFetch(
  url: string,
  init: RequestInit,
  config: ProviderConfig,
  fetchImpl: typeof fetch
): Promise<Response> {
  const configuredGuard = getProviderOutboundGuard();
  if (fetchImpl !== fetch) {
    return Promise.reject(
      new Error("Provider requests cannot use a custom transport without DNS pinning")
    );
  }
  return safeOutboundFetch(url, {
    ...init,
    // Configured provider endpoints may intentionally be local/LAN, but a
    // credential-bearing request must never reach cloud metadata.
    guard: config.apiKey && configuredGuard === "none" ? "block-metadata" : configuredGuard,
    pinDns: true,
    allowRedirect: false,
    retry: false,
    ...(fetchImpl === fetch ? {} : { fetchImpl }),
  });
}

const openaiAdapter: ProviderAdapter = {
  kind: "openai",
  complete: (request, config, fetchImpl = fetch) =>
    providerFetch(
      `${trimUrl(config.baseUrl)}/chat/completions`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders(config) },
        body: JSON.stringify({ ...request, model: request.model || config.model }),
      },
      config,
      fetchImpl
    ),
};

const localAdapter: ProviderAdapter = { ...openaiAdapter, kind: "local" };

const anthropicAdapter: ProviderAdapter = {
  kind: "anthropic",
  complete: (request, config, fetchImpl = fetch) => {
    const model = request.model || config.model;
    const body = openaiToClaudeRequest(model, request, Boolean(request.stream));
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
      ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
    };
    return providerFetch(
      `${trimUrl(config.baseUrl)}/messages`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      },
      config,
      fetchImpl
    ).then(async (response) => {
      if (!response.ok) return response;
      const responseHeaders = new Headers(response.headers);
      responseHeaders.delete("content-length");
      responseHeaders.delete("content-encoding");
      if (request.stream && response.body) {
        responseHeaders.set("content-type", "text/event-stream");
        const transform = createSSETransformStreamWithLogger(
          FORMATS.CLAUDE,
          FORMATS.OPENAI,
          config.id,
          null,
          null,
          model
        );
        return new Response(response.body.pipeThrough(transform), {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
        });
      }
      const payload = await response.json();
      const translated = translateNonStreamingResponse(payload, FORMATS.CLAUDE, FORMATS.OPENAI);
      responseHeaders.set("content-type", "application/json");
      return new Response(JSON.stringify(translated), {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    });
  },
};

const ADAPTERS: Record<ProviderKind, ProviderAdapter> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  local: localAdapter,
};

export function getProviderAdapter(kind: ProviderKind): ProviderAdapter {
  return ADAPTERS[kind];
}

export interface ProviderConfigFile {
  providers: ProviderConfig[];
}

/** Parse self-hosted YAML without persisting or logging credentials. */
export function parseProviderConfig(source: string): ProviderConfigFile {
  const document = yaml.load(source);
  if (!document || typeof document !== "object" || Array.isArray(document))
    throw new Error("Provider config must be a mapping");
  const providers = (document as Record<string, unknown>).providers;
  if (!Array.isArray(providers)) throw new Error("Provider config requires a providers list");
  const parsed = providers.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error(`Provider ${index} must be a mapping`);
    const item = value as Record<string, unknown>;
    const id = typeof item.id === "string" && item.id.trim();
    const kind = item.kind;
    const baseUrl = typeof item.baseUrl === "string" && item.baseUrl.trim();
    const model = typeof item.model === "string" && item.model.trim();
    if (
      !id ||
      !baseUrl ||
      !model ||
      !(kind === "openai" || kind === "anthropic" || kind === "local")
    )
      throw new Error(`Invalid provider ${index}`);
    const provider: ProviderConfig = {
      id,
      kind,
      baseUrl,
      model,
      ...(typeof item.apiKey === "string" && item.apiKey ? { apiKey: item.apiKey } : {}),
    };
    return provider;
  });
  const ids = new Set<string>();
  for (const provider of parsed) {
    if (ids.has(provider.id)) throw new Error(`Duplicate provider id: ${provider.id}`);
    ids.add(provider.id);
  }
  return { providers: parsed };
}

export function publicProviderConfigs(
  config: ProviderConfigFile
): Array<Omit<ProviderConfig, "apiKey">> {
  return config.providers.map(({ apiKey: _apiKey, ...safe }) => safe);
}

export class ProviderRouter {
  private readonly providers: Map<string, ProviderConfig>;
  constructor(config: ProviderConfigFile) {
    this.providers = new Map(config.providers.map((provider) => [provider.id, provider]));
  }
  select(id?: string): ProviderConfig {
    const selected = id ? this.providers.get(id) : this.providers.values().next().value;
    if (!selected) throw new Error(id ? `Unknown provider: ${id}` : "No providers configured");
    return selected;
  }
  complete(request: ChatRequest, id?: string, fetchImpl?: typeof fetch): Promise<Response> {
    const config = this.select(id);
    return getProviderAdapter(config.kind).complete(request, config, fetchImpl);
  }
}
