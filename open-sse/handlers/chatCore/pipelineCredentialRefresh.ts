/**
 * Non-stream provider-pipeline credential refresh.
 *
 * Keeps the reactive 401 refresh path atomic across network refresh, persistence,
 * and the request-local credential object while protecting rotating refresh tokens
 * with the same CAS guard used by chatCore's streaming path.
 */

import type { ProviderCredentials } from "../../executors/base.ts";
import type { RefreshLogger } from "../../services/tokenRefresh/shared.ts";
import {
  refreshWithRetry,
  isUnrecoverableRefreshError,
  runWithOnPersist,
  runWithCasGuard,
} from "../../services/tokenRefresh.ts";
import { getProviderConnectionById } from "@/lib/db/providers";
import { wasRefreshTokenRotated } from "../../services/refreshSerializer.ts";

type CredentialRecord = ProviderCredentials & Record<string, unknown>;
type CredentialPatch = Partial<ProviderCredentials> & Record<string, unknown>;

type PipelineCredentialRefresherOptions = {
  shouldIsolateProbeFailures: () => boolean | Promise<boolean>;
  credentials: Record<string, unknown>;
  onCredentialsRefreshed?: ((patch: CredentialPatch) => void | Promise<void>) | null;
  provider: string;
  log: RefreshLogger;
  refreshCredentials: (credentials: ProviderCredentials) => Promise<CredentialPatch | null>;
};

export function createPipelineCredentialRefresher({
  shouldIsolateProbeFailures,
  credentials,
  onCredentialsRefreshed,
  provider,
  log,
  refreshCredentials,
}: PipelineCredentialRefresherOptions): (
  currentCredentials: Record<string, unknown>
) => Promise<Record<string, unknown> | null> {
  return async (currentCredentials) => {
    if (await shouldIsolateProbeFailures()) return null;

    const current = currentCredentials as CredentialRecord;
    const attemptedRefreshToken =
      typeof current.refreshToken === "string" ? current.refreshToken : null;
    let persistFnRan = false;
    const persistFn = onCredentialsRefreshed
      ? async (refreshResult: CredentialPatch) => {
          persistFnRan = true;
          Object.assign(credentials, refreshResult);
          await onCredentialsRefreshed(refreshResult);
        }
      : undefined;
    const casConnectionId = typeof current.connectionId === "string" ? current.connectionId.trim() : "";
    const casReread = casConnectionId
      ? async () => {
          const latest = await getProviderConnectionById(casConnectionId);
          return typeof latest?.refreshToken === "string" ? latest.refreshToken : null;
        }
      : null;

    const refreshed = (await refreshWithRetry(
      () =>
        runWithCasGuard(
          casReread ? { expectedRefreshToken: attemptedRefreshToken, reread: casReread } : null,
          () => runWithOnPersist(persistFn, () => refreshCredentials(current))
        ),
      3,
      log,
      provider
    )) as CredentialPatch | null;

    if (refreshed?.accessToken || refreshed?.copilotToken) {
      if (!persistFnRan) {
        Object.assign(credentials, refreshed);
        if (onCredentialsRefreshed) await onCredentialsRefreshed(refreshed);
      }
      return refreshed;
    }

    if (isUnrecoverableRefreshError(refreshed) && onCredentialsRefreshed) {
      let alreadyRotated = false;
      if (casConnectionId && attemptedRefreshToken) {
        try {
          const latest = await getProviderConnectionById(casConnectionId);
          alreadyRotated = wasRefreshTokenRotated(attemptedRefreshToken, latest?.refreshToken);
        } catch {
          // Safe default below is to mark the credential expired.
        }
      }
      if (!alreadyRotated) {
        await onCredentialsRefreshed({ testStatus: "expired", isActive: false });
      }
    }
    return null;
  };
}
