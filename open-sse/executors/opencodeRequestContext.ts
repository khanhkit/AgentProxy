/** Request-local state for the shared OpenCode executor instance. */
import { AsyncLocalStorage } from "node:async_hooks";

export interface OpencodeRequestContext {
  format: string | null;
}

const store = new AsyncLocalStorage<OpencodeRequestContext>();

/** Run one OpenCode request with state isolated from overlapping requests. */
export function runInOpencodeRequestContext<T>(fn: () => T): T {
  return store.run({ format: null }, fn);
}

export function currentOpencodeRequestContext(): OpencodeRequestContext | undefined {
  return store.getStore();
}
