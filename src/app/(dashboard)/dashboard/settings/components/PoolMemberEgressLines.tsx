"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type MemberEgress = {
  host: string;
  port: number;
  egressIp: string | null;
  at: string | null;
};

type MemberEgressBody = {
  windowHours: number;
  members: MemberEgress[];
};

function isMemberEgressBody(value: unknown): value is MemberEgressBody {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (typeof record.windowHours !== "number" || !Array.isArray(record.members)) return false;
  return record.members.every(
    (member) =>
      !!member &&
      typeof member === "object" &&
      typeof (member as Record<string, unknown>).host === "string" &&
      typeof (member as Record<string, unknown>).port === "number" &&
      (typeof (member as Record<string, unknown>).egressIp === "string" ||
        (member as Record<string, unknown>).egressIp === null) &&
      (typeof (member as Record<string, unknown>).at === "string" ||
        (member as Record<string, unknown>).at === null)
  );
}

/**
 * One line per pool member under the pool editor: the last egress IP observed through
 * that member's (host, port) over the window. Renders nothing when the observation is
 * off, failed, or the request itself errored; a member with no traffic in the window
 * renders the "no traffic" line instead of being hidden.
 */
export function PoolMemberEgressLines({ query }: { query: string }) {
  const t = useTranslations("proxyRegistry");
  const [loaded, setLoaded] = useState<{ query: string; body: MemberEgressBody | null }>({
    query: "",
    body: null,
  });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/settings/proxies/pool/member-egress?${query}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        if (!cancelled) setLoaded({ query, body: isMemberEgressBody(body) ? body : null });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ query, body: null });
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const body = loaded.query === query ? loaded.body : null;
  if (!body) return null;

  const has = (t as typeof t & { has?: (key: string) => boolean }).has;
  const canTranslate = (key: string) => typeof has === "function" && has(key);
  const title = canTranslate("poolMemberEgressHint")
    ? t("poolMemberEgressHint")
    : "Last observed egress IP for this proxy endpoint.";

  return (
    <div className="flex flex-col gap-1" data-testid="proxy-registry-pool-member-egress">
      {body.members.map((member) => (
        <p key={`${member.host}:${member.port}`} className="text-xs text-text-muted" title={title}>
          {member.egressIp
            ? canTranslate("poolMemberEgress")
              ? t("poolMemberEgress", {
                  host: member.host,
                  port: member.port,
                  egressIp: member.egressIp,
                  hours: body.windowHours,
                })
              : `${member.host}:${member.port} → ${member.egressIp} (last ${body.windowHours}h)`
            : canTranslate("poolMemberEgressEmpty")
              ? t("poolMemberEgressEmpty", {
                  host: member.host,
                  port: member.port,
                  hours: body.windowHours,
                })
              : `${member.host}:${member.port} → no observed egress traffic in the last ${body.windowHours}h`}
        </p>
      ))}
    </div>
  );
}
