import { SYNTHETIC_SELF_LOOP_API_KEY_ID } from "@/shared/constants/apiKeyIdentities";
import { peekGeneratedSelfLoopSecret } from "@/shared/middleware/chatAdmissionIdentity";
import { timingSafeCompare } from "@/shared/utils/timingSafeCompare";

export function isSelfLoopBearer(key: string): boolean {
  const secret = peekGeneratedSelfLoopSecret();
  return secret !== null && timingSafeCompare(key, secret);
}

export function selfLoopKeyOverrides(key: string) {
  if (!isSelfLoopBearer(key)) return {};
  return {
    id: SYNTHETIC_SELF_LOOP_API_KEY_ID,
    name: "Internal self-loop",
    scopes: ["internal:self-loop"],
    allowedEndpoints: ["chat", "audio"],
  };
}
