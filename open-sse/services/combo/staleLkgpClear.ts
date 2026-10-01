/**
 * Clear persisted LKGP pins when a combo target fails or is skipped.
 *
 * Non-blocking for routing callers, but returns a promise so tests and explicit
 * lifecycle code can await settlement. Failed-target metadata prevents clearing
 * a combo pin that now names a different provider/connection.
 */
type WarnLogger = { warn?: (tag: string, msg: string, data?: unknown) => void } | null;
type ClearLkgp = (comboName: string, modelKey: string) => Promise<void>;

export function clearStaleLKGP(
  comboName: string,
  executionKey?: string | null,
  comboId?: string | null,
  log?: WarnLogger,
  tag: string = "COMBO",
  clearLKGP?: ClearLkgp,
  failed?: { provider?: string | null; connectionId?: string | null } | null
): Promise<void> {
  return (async () => {
    const settings = clearLKGP ? null : await import("@/lib/db/settings");
    const clear = clearLKGP ?? settings!.clearLKGP;
    const comboKey = comboId || comboName;
    const promises: Promise<void>[] = executionKey ? [clear(comboName, executionKey)] : [];

    if (!failed?.provider) {
      promises.push(clear(comboName, comboKey));
    } else {
      const getLKGP = settings?.getLKGP ?? (await import("@/lib/db/settings")).getLKGP;
      const pin = await getLKGP(comboName, comboKey);
      const namesFailedTarget =
        pin?.provider === failed.provider &&
        (!pin?.connectionId || !failed.connectionId || pin.connectionId === failed.connectionId);
      if (namesFailedTarget) promises.push(clear(comboName, comboKey));
    }

    await Promise.all(promises);
  })().catch((err) => {
    log?.warn?.(tag, "Failed to clear Last Known Good Provider. This is non-fatal.", {
      combo: comboName,
      comboId: comboId ?? null,
      executionKey: executionKey ?? null,
      err,
    });
  });
}
