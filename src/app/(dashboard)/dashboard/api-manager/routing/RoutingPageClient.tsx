"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import ReasoningRoutingRules from "@/shared/components/ReasoningRoutingRules";

export default function RoutingPageClient() {
  const t = useTranslations("reasoningRouting");
  const tc = useTranslations("common");
  const searchParams = useSearchParams();
  const apiKeyId = searchParams.get("apiKeyId")?.trim() || undefined;

  return (
    <div className="min-w-0 w-full space-y-6 pb-10">
      <header className="space-y-3">
        <Link href="/dashboard/api-manager" className="text-sm text-primary hover:underline">
          ← {tc("back")}
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-main">
            {apiKeyId ? t("apiKeyTitle") : t("title")}
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-text-muted">{t("subtitle")}</p>
        </div>
      </header>
      <ReasoningRoutingRules key={apiKeyId || "all"} initialApiKeyId={apiKeyId} />
    </div>
  );
}
