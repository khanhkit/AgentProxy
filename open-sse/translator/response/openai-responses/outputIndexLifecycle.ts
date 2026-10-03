type OutputIndexState = {
  msgItemAdded: Record<number, unknown>;
  reasoningId?: unknown;
  reasoningIndex?: unknown;
  funcAllocatedOutputIndexes?: Record<number, boolean>;
};

export function nextFreeMessageIndex(
  state: OutputIndexState,
  requestedIdx: unknown,
  normalizeOutputIndex: (value: unknown) => number
): number {
  let candidate = normalizeOutputIndex(requestedIdx);
  const allocatedToolIndexes = state.funcAllocatedOutputIndexes ?? {};
  const claimed = (index: number) =>
    Boolean(state.msgItemAdded[index]) ||
    allocatedToolIndexes[index] !== undefined ||
    (Boolean(state.reasoningId) && index === normalizeOutputIndex(state.reasoningIndex));
  while (claimed(candidate)) candidate += 1;
  return candidate;
}

export function markToolCallOutputIndex(state: OutputIndexState, outputIndex: number): void {
  (state.funcAllocatedOutputIndexes ??= {})[outputIndex] = true;
}
