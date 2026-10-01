import { getSettings } from "@/lib/db/settings";

export type HomeSettings = { setupComplete?: unknown };

/**
 * Settings read for the Home Server Component (#14060).
 *
 * A corrupted key_value table makes getSettings() throw. Home is display-only,
 * so degrade here instead of weakening getSettings(): auth/authz callers rely
 * on DB read failures propagating so they fail closed.
 */
export async function loadHomeSettings(
  load: () => Promise<HomeSettings> = getSettings
): Promise<HomeSettings> {
  try {
    return await load();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Home] Failed to load settings; rendering with defaults: ${message}`);
    return { setupComplete: false };
  }
}
