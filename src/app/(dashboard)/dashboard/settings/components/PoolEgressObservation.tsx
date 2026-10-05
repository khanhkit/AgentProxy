"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type Observation = {
  connections: number;
  distinctExits: number;
  maxConnectionsOnOneExit: number;
  windowHours: number;
};

const OBSERVATION_KEYS = [
  "connections",
  "distinctExits",
  "maxConnectionsOnOneExit",
  "windowHours",
] as const;

function isObservation(value: unknown): value is Observation {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return OBSERVATION_KEYS.every((key) => typeof record[key] === "number");
}

/**
 * One line under a pool's member list: how many observed egress IPs actually served its
 * members over the window, and how many connections the busiest one carried. Renders
 * nothing when the observation is off, failed, or the request itself errored.
 */
export function PoolEgressObservation({ query }: { query: string }) {
  const t = useTranslations("proxyRegistry");
  const [loaded, setLoaded] = useState<{ query: string; observation: Observation | null }>({
    query: "",
    observation: null,
  });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/settings/proxies/pool/egress-observation?${query}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        if (!cancelled) setLoaded({ query, observation: isObservation(body) ? body : null });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ query, observation: null });
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const observation = loaded.query === query ? loaded.observation : null;
  if (!observation) return null;

  const has = (t as typeof t & { has?: (key: string) => boolean }).has;
  const canTranslate = (key: string) => typeof has === "function" && has(key);
  const emptyKey = "poolEgressObservationEmpty";
  const observationKey = "poolEgressObservation";
  const hintKey = "poolEgressObservationHint";
  const text =
    observation.connections === 0
      ? canTranslate(emptyKey)
        ? t(emptyKey, { hours: observation.windowHours })
        : `No observed egress traffic in the last ${observation.windowHours}h.`
      : canTranslate(observationKey)
        ? t(observationKey, {
            exits: observation.distinctExits,
            connections: observation.connections,
            max: observation.maxConnectionsOnOneExit,
            hours: observation.windowHours,
          })
        : `${observation.distinctExits} observed egress IPs served ${observation.connections} connections in the last ${observation.windowHours}h; busiest IP carried ${observation.maxConnectionsOnOneExit}.`;

  const title = canTranslate(hintKey)
    ? t(hintKey)
    : "Read-only observation derived from recent proxy logs.";

  return (
    <p
      className="text-xs text-text-muted mb-1"
      title={title}
      data-testid="proxy-registry-pool-egress-observation"
    >
      {text}
    </p>
  );
}
