const ACTIVE_QUEUE_STATES = new Set(['queued', 'pending', 'waiting']);

export function decideAttemptAction({ status, conclusion = null, elapsedSeconds, queueTimeoutSeconds, claim = 'unset' }) {
  if (status === 'completed') {
    if (claim === 'denied' && conclusion === 'cancelled') return { action: 'fallback' };
    return { action: 'terminal', conclusion };
  }
  if (claim === 'denied') return { action: 'wait-for-terminal-cancel' };
  if (status === 'in_progress') return { action: 'grant' };
  if (ACTIVE_QUEUE_STATES.has(status)) {
    return elapsedSeconds >= queueTimeoutSeconds ? { action: 'deny-and-cancel' } : { action: 'wait' };
  }
  throw new Error(`unknown attempt status: ${status}`);
}

export async function runFallbackScheduler(adapter, workload, context) {
  const pollIntervalMs = context.pollIntervalMs ?? 1000;
  const attempts = [];
  for (let index = 0; index < workload.compatibleRunners.length; index += 1) {
    const runner = workload.compatibleRunners[index];
    const claimContext = `agentproxy/runner-claim/${workload.id}/${context.sourceSha}/${index + 1}`;
    const attempt = await adapter.dispatchAttempt({ runner, claimContext, workload, context, attemptIndex: index + 1 });
    await adapter.setClaim(attempt, 'pending');
    const startedAt = adapter.now();
    let claim = 'pending';
    let timeoutTriggered = false;
    const record = { attempt: index + 1, runner, claimContext, outcome: null };
    attempts.push(record);

    for (;;) {
      const observation = await adapter.observeAttempt(attempt);
      const elapsedSeconds = Math.max(0, adapter.now() - startedAt);
      const decision = decideAttemptAction({
        status: observation.status,
        conclusion: observation.conclusion ?? null,
        elapsedSeconds,
        queueTimeoutSeconds: workload.queueTimeoutSeconds,
        claim,
      });

      if (decision.action === 'wait') {
        await adapter.sleep(pollIntervalMs);
        continue;
      }
      if (decision.action === 'grant') {
        await adapter.setClaim(attempt, 'granted');
        record.outcome = 'started';
        record.queueSeconds = elapsedSeconds;
        return { status: 'started', runner, attempt, attempts };
      }
      if (decision.action === 'deny-and-cancel') {
        await adapter.setClaim(attempt, 'denied');
        claim = 'denied';
        timeoutTriggered = true;
        record.outcome = 'queue-timeout';
        record.queueSeconds = elapsedSeconds;
        await adapter.cancelAttempt(attempt);
        continue;
      }
      if (decision.action === 'wait-for-terminal-cancel') {
        await adapter.sleep(pollIntervalMs);
        continue;
      }
      if (decision.action === 'fallback') {
        if (!timeoutTriggered) {
          record.outcome = 'unexpected-cancel';
          return { status: 'terminal', conclusion: 'cancelled', runner, attempt, attempts };
        }
        record.outcome = 'cancelled-after-timeout';
        break;
      }
      if (decision.action === 'terminal') {
        record.outcome = `terminal-${decision.conclusion ?? 'unknown'}`;
        return { status: 'terminal', conclusion: decision.conclusion, runner, attempt, attempts };
      }
      throw new Error(`unhandled scheduler action: ${decision.action}`);
    }
  }
  return { status: 'exhausted', attempts };
}
