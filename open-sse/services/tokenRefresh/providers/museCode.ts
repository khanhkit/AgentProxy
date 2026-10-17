import { MUSE_CODE_MINT_URL, isMuseDcaToken } from "../../../config/museCode.ts";
import { mintMuseApiKey } from "../../museCodeAuth.ts";
import { runWithProxyContext } from "../../../utils/proxyFetch.ts";
import type { RefreshLogger } from "../shared.ts";

/**
 * Muse Code has no refresh-token grant. CLIProxyAPI remints the inference key
 * from the durable `dca:` device token on 401 / missing API key. AgentProxy
 * stores that DCA token as `refreshToken`.
 */
export async function refreshMuseCodeToken(
  refreshToken: string,
  providerSpecificData: Record<string, unknown> | null | undefined,
  log: RefreshLogger,
  proxyConfig: unknown = null
) {
  const dcaFromRefresh = isMuseDcaToken(refreshToken) ? refreshToken.trim() : "";
  const dcaFromData =
    typeof providerSpecificData?.dcaToken === "string" ? providerSpecificData.dcaToken.trim() : "";
  // Prefer the dedicated refresh-token field. The metadata fallback migrates
  // existing connections created before the DCA storage hardening below.
  const dcaToken = dcaFromRefresh || (isMuseDcaToken(dcaFromData) ? dcaFromData : "");
  if (!dcaToken) {
    log?.warn?.("TOKEN_REFRESH", "Muse Code refresh missing dca token");
    return null;
  }

  try {
    const minted = await runWithProxyContext(proxyConfig, () =>
      mintMuseApiKey(dcaToken, MUSE_CODE_MINT_URL)
    );
    const { dcaToken: _legacyDcaToken, ...safeProviderData } =
      providerSpecificData && typeof providerSpecificData === "object" ? providerSpecificData : {};
    return {
      accessToken: minted.apiKey,
      refreshToken: dcaToken,
      expiresIn: undefined,
      providerSpecificData: {
        ...safeProviderData,
        baseUrl: minted.baseUrl,
        email: minted.email,
        name: minted.name,
        subsTierName: minted.subsTierName,
        subsTierId: minted.subsTierId,
        isSubsActive: minted.isSubsActive,
        hasPaymentMethod: minted.hasPaymentMethod,
        requirePayment: minted.requirePayment,
        canSubscribe: minted.canSubscribe,
        lastRefresh: new Date().toISOString(),
      },
    };
  } catch (err) {
    log?.warn?.("TOKEN_REFRESH", `Muse Code remint failed: ${(err as Error)?.message || "error"}`);
    return null;
  }
}
