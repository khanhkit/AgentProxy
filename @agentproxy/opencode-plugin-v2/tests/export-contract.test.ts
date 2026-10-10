import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultAgentProxyAutoCombosFetcher,
  defaultAgentProxyCombosFetcher,
  defaultAgentProxyEnrichmentFetcher,
  defaultAgentProxyModelsFetcher,
  defaultAgentProxyProvidersFetcher,
  type AgentProxyAutoCombosFetcher,
  type AgentProxyCombosFetcher,
  type AgentProxyEnrichmentFetcher,
  type AgentProxyEnrichmentMap,
  type AgentProxyModelsFetcher,
  type AgentProxyProviderConnection,
  type AgentProxyProvidersFetcher,
  type AgentProxyRawAutoCombo,
  type AgentProxyRawCombo,
  type AgentProxyRawModelEntry,
} from "../src/shared/index.js";

const typeContract = (_value: {
  models: AgentProxyModelsFetcher;
  combos: AgentProxyCombosFetcher;
  autoCombos: AgentProxyAutoCombosFetcher;
  providers: AgentProxyProvidersFetcher;
  enrichment: AgentProxyEnrichmentFetcher;
  rawModel: AgentProxyRawModelEntry | null;
  rawCombo: AgentProxyRawCombo | null;
  rawAutoCombo: AgentProxyRawAutoCombo | null;
  provider: AgentProxyProviderConnection | null;
  enrichmentMap: AgentProxyEnrichmentMap;
}) => undefined;

test("shared v2 contract exposes one AgentProxy-native fetcher/type surface", () => {
  typeContract({
    models: defaultAgentProxyModelsFetcher,
    combos: defaultAgentProxyCombosFetcher,
    autoCombos: defaultAgentProxyAutoCombosFetcher,
    providers: defaultAgentProxyProvidersFetcher,
    enrichment: defaultAgentProxyEnrichmentFetcher,
    rawModel: null,
    rawCombo: null,
    rawAutoCombo: null,
    provider: null,
    enrichmentMap: new Map(),
  });

  for (const fetcher of [
    defaultAgentProxyModelsFetcher,
    defaultAgentProxyCombosFetcher,
    defaultAgentProxyAutoCombosFetcher,
    defaultAgentProxyProvidersFetcher,
    defaultAgentProxyEnrichmentFetcher,
  ]) {
    assert.equal(typeof fetcher, "function");
  }
});
