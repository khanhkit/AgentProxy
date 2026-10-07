import { resolveRequestToolIdentity } from "./requestToolIdentity.ts";
import { plaintextCollaborationFields } from "./collaborationPlaintextMarker.ts";

interface FunctionCallItemLike {
  namespace?: string;
  name?: string;
  encrypted_function_args?: unknown[];
  [key: string]: unknown;
}

/** Restore Responses namespace identity and stamp collaboration plaintext metadata. */
export function applyFunctionCallIdentity<T extends FunctionCallItemLike>(
  item: T,
  identityMap: unknown,
  toolName: string
): T {
  const identity = resolveRequestToolIdentity(identityMap, toolName);
  if (identity) {
    item.namespace = identity.namespace;
    item.name = identity.name;
  }
  Object.assign(item, plaintextCollaborationFields(item.namespace, item.name));
  return item;
}
