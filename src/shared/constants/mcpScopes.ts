/**
 * MCP Authorization Scopes — Defines permission scopes for each MCP tool.
 *
 * Each tool requires specific scopes to execute. API keys can be configured
 * with a subset of scopes to limit tool access (least-privilege).
 */

// ============ Scope Definitions ============

/** All available MCP scopes */
export const MCP_SCOPE_LIST = [
  "read:health",
  "read:combos",
  "write:combos",
  "read:quota",
  "read:usage",
  "read:models",
  "read:radar",
  "execute:completions",
  "execute:search",
  "write:budget",
  "write:resilience",
  "pricing:write",
  "read:cache",
  "write:cache",
  "read:compression",
  "write:compression",
  "read:proxies",
] as const;

export type McpScope = (typeof MCP_SCOPE_LIST)[number];

// ============ Tool → Scope Mapping ============

/** Maps each MCP tool to its required scopes */
export const MCP_TOOL_SCOPES: Record<string, readonly McpScope[]> = {
  // Phase 1: Essential Tools
  agentproxy_get_health: ["read:health"],
  agentproxy_list_combos: ["read:combos"],
  agentproxy_get_combo_metrics: ["read:combos"],
  agentproxy_switch_combo: ["write:combos"],
  agentproxy_check_quota: ["read:quota"],
  agentproxy_route_request: ["execute:completions"],
  agentproxy_web_search: ["execute:search"],
  agentproxy_x_search: ["execute:search"],
  agentproxy_web_fetch: ["execute:search"],
  agentproxy_cost_report: ["read:usage"],
  agentproxy_list_models_catalog: ["read:models"],
  agentproxy_radar_catalog: ["read:radar"],

  // Phase 2: Advanced Tools
  agentproxy_simulate_route: ["read:health", "read:combos"],
  agentproxy_set_budget_guard: ["write:budget"],
  agentproxy_set_resilience_profile: ["write:resilience"],
  agentproxy_test_combo: ["execute:completions", "read:combos"],
  agentproxy_get_provider_metrics: ["read:health"],
  agentproxy_best_combo_for_task: ["read:combos", "read:health"],
  agentproxy_explain_route: ["read:health", "read:usage"],
  agentproxy_get_session_snapshot: ["read:usage"],
  agentproxy_db_health_check: ["read:health", "write:resilience"],
  agentproxy_sync_pricing: ["pricing:write"],
  agentproxy_cache_stats: ["read:cache"],
  agentproxy_cache_flush: ["write:cache"],
  agentproxy_compression_status: ["read:compression"],
  agentproxy_compression_configure: ["write:compression"],
  agentproxy_set_compression_engine: ["write:compression"],
  agentproxy_list_compression_combos: ["read:compression"],
  agentproxy_compression_combo_stats: ["read:compression"],
  agentproxy_ccr_store: ["write:compression"],
  agentproxy_ccr_retrieve: ["read:compression"],
  agentproxy_ccr_inspect: ["read:compression"],
  agentproxy_ccr_list: ["read:compression"],
  agentproxy_ccr_delete: ["write:compression"],
  agentproxy_ccr_stats: ["read:compression"],
  agentproxy_oneproxy_fetch: ["read:proxies"],
  agentproxy_oneproxy_rotate: ["read:proxies"],
  agentproxy_oneproxy_stats: ["read:proxies"],

  // Web-session pool observability (read) + lifecycle (write)
  agentproxy_pool_status: ["read:health"],
  agentproxy_pool_sessions: ["read:health"],
  agentproxy_pool_health: ["read:health"],
  agentproxy_pool_reset: ["write:resilience"],
  agentproxy_pool_warm: ["write:resilience"],
  // Stealth browser pool observability (#3368 PR7)
  agentproxy_browser_pool_status: ["read:health"],
} as const;
