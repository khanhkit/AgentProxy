"use client";

import { useState } from "react";
import type { CodexAccountPoolProjection } from "@agentproxy/open-sse/services/codexAccount/index.ts";
import { useLocale, useTranslations } from "next-intl";

export interface CodexAccountDetailsProps {
  pool: CodexAccountPoolProjection;
}

function formatQuota(
  window: CodexAccountPoolProjection["children"][number]["quota"]["windows"]["5h"],
  usedLabel: string
): string {
  if (!window) return "—";
  if (window.usedPercentage !== null) return `${Math.round(window.usedPercentage)}% ${usedLabel}`;
  if (window.usage !== null && window.limit !== null) return `${window.usage}/${window.limit}`;
  return "—";
}

export default function CodexAccountDetails({ pool }: CodexAccountDetailsProps) {
  const t = useTranslations("providers");
  const locale = useLocale();
  const [releasedState, setReleasedState] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const stateKey = JSON.stringify(pool);
  const released = releasedState === stateKey;
  const codex = pool.children.find((child) => child.key.scope === "codex");
  const releasedLimitedCodex = Boolean(released && codex?.unavailable);

  async function releaseCodexCooldown() {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/api/providers/codex-cooldown", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ connectionId: pool.parentConnectionId }),
      });
      if (!response.ok) throw new Error("release failed");
      setReleasedState(stateKey);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const statusLabels = {
    available: t("codexPoolAvailable"),
    partially_limited: t("codexPoolPartiallyLimited"),
    fully_limited: t("codexPoolFullyLimited"),
  };
  const limitedCount = Math.max(
    0,
    pool.aggregate.limitedChildCount - (releasedLimitedCodex ? 1 : 0)
  );
  const aggregateStatus: keyof typeof statusLabels =
    limitedCount === 0
      ? "available"
      : limitedCount >= pool.children.length
        ? "fully_limited"
        : "partially_limited";

  return (
    <div className="mt-3 rounded-lg border border-border/60 bg-surface-secondary/30 p-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
        <span className="font-medium">{t("codexQuotaPools")}</span>
        <span className="text-text-muted">
          {statusLabels[aggregateStatus]} ·{" "}
          {t("codexPoolLimited", { count: limitedCount })}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {pool.children.map((child) => (
          <div
            key={child.key.scope}
            className="rounded-md border border-border/50 bg-background/60 px-2.5 py-2 text-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{child.key.scope === "codex" ? "Codex" : "Spark"}</span>
              <span
                className={
                  child.key.scope === "codex" && released
                    ? "text-text-muted"
                    : child.unavailable
                      ? "text-amber-500"
                      : "text-text-muted"
                }
              >
                {child.key.scope === "codex" && released
                  ? t("codexPoolAvailable")
                  : child.quota.exhaustedWindow
                    ? t("codexPoolQuotaExhausted")
                    : child.cooldown.active
                      ? t("codexPoolCoolingDown")
                      : t("codexPoolAvailable")}
              </span>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-2 text-text-muted">
              <span>5h: {formatQuota(child.quota.windows["5h"], t("codexPoolUsed"))}</span>
              <span>7d: {formatQuota(child.quota.windows["7d"], t("codexPoolUsed"))}</span>
            </div>
            {child.cooldown.rateLimitedUntil && !(child.key.scope === "codex" && released) ? (
              <div className="mt-1 text-[11px] text-amber-500">
                {t("codexPoolUntil", {
                  value: new Intl.DateTimeFormat(locale, {
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(new Date(child.cooldown.rateLimitedUntil)),
                })}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {codex?.unavailable && !released ? (
        <button
          type="button"
          disabled={busy}
          onClick={releaseCodexCooldown}
          className="mt-2 text-xs text-primary disabled:opacity-50"
          title={t("clearConnectionCooldownTitle")}
        >
          {t("clearConnectionCooldown")}
        </button>
      ) : null}
      {failed ? (
        <p role="alert" className="mt-2 text-xs text-red-500">
          {t("failedClearConnectionCooldown")}
        </p>
      ) : null}
    </div>
  );
}
