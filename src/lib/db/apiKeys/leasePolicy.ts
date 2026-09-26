const EXCLUSIVE_LEASE_SCOPE = "lease:exclusive";

export class ApiKeyPolicyInvariantError extends Error {
  readonly code = "LEASE_KEY_POLICY_INVALID";
}

export function assertExclusiveLeaseKeyPolicy(
  scopes: readonly string[],
  allowedConnections: readonly string[]
): void {
  if (scopes.includes(EXCLUSIVE_LEASE_SCOPE) && allowedConnections.length === 0) {
    throw new ApiKeyPolicyInvariantError("lease:exclusive requires explicit allowedConnections");
  }
}
