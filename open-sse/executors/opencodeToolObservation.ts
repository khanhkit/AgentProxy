/**
 * OpenCode free-tier accepted-tool observation cache.
 *
 * Stores names only — never schemas, descriptions, or conversation content.
 * Session-scoped entries are preferred, with a model-scoped fallback.
 */
const MAX_NAMES_PER_ENTRY = 32;
const MAX_ENTRIES = 64;
const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;

const observed = new Map<string, readonly string[]>();

function keyOf(provider: string, model: string, session?: string): string {
  return [provider, model, session ?? ""].join("|");
}

function sanitize(names: readonly unknown[]): string[] {
  const kept: string[] = [];
  for (const raw of names) {
    if (kept.length >= MAX_NAMES_PER_ENTRY) break;
    if (typeof raw !== "string" || !NAME_PATTERN.test(raw)) continue;
    if (!kept.includes(raw)) kept.push(raw);
  }
  return kept;
}

export function recordAcceptedToolNames(
  provider: string,
  model: string,
  session: string | undefined,
  names: readonly unknown[]
): void {
  const kept = sanitize(names);
  if (kept.length === 0) return;
  const frozen = Object.freeze(kept);

  for (const key of session
    ? [keyOf(provider, model, session), keyOf(provider, model)]
    : [keyOf(provider, model)]) {
    observed.delete(key);
    observed.set(key, frozen);
  }

  while (observed.size > MAX_ENTRIES) {
    const oldest = observed.keys().next();
    if (oldest.done) break;
    observed.delete(oldest.value);
  }
}

export function getObservedToolNames(
  provider: string,
  model: string,
  session?: string
): readonly string[] | null {
  return observed.get(keyOf(provider, model, session)) ?? null;
}

export function _resetToolObservationForTests(): void {
  observed.clear();
}
