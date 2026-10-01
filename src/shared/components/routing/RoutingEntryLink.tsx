"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

export function routingEditorHref(apiKeyId?: string): string {
  const normalized = apiKeyId?.trim();
  return normalized
    ? `/dashboard/api-manager/routing?apiKeyId=${encodeURIComponent(normalized)}`
    : "/dashboard/api-manager/routing";
}

export default function RoutingEntryLink({ apiKeyId }: { apiKeyId?: string }) {
  const t = useTranslations("reasoningRouting");

  return (
    <Link
      href={routingEditorHref(apiKeyId)}
      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface/40 px-4 py-3 transition-colors hover:bg-surface"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium text-text-main">
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            route
          </span>
          <span>{apiKeyId ? t("apiKeyTitle") : t("title")}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-text-muted">{t("subtitle")}</p>
      </div>
      <span className="material-symbols-outlined shrink-0 text-text-muted" aria-hidden="true">
        arrow_forward
      </span>
    </Link>
  );
}
