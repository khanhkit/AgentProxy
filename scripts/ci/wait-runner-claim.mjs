const terminalDenied = new Set(['failure','error']);
export function interpretClaim(statuses, context) {
  const status = statuses.find((s) => s.context === context);
  if (!status || status.state === 'pending') return 'wait';
  if (status.state === 'success') return 'granted';
  if (terminalDenied.has(status.state)) return 'denied';
  return 'wait';
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

export async function waitForClaim({repo, sha, context, token, timeoutSeconds=90, pollMs=1000, fetchImpl=fetch}) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    const res = await fetchImpl(`https://api.github.com/repos/${repo}/commits/${sha}/statuses?per_page=100`, {
      headers: {Accept:'application/vnd.github+json', Authorization:`Bearer ${token}`, 'X-GitHub-Api-Version':'2026-03-10'}
    });
    if (!res.ok) throw new Error(`claim status API ${res.status}`);
    const decision = interpretClaim(await res.json(), context);
    if (decision === 'granted') return;
    if (decision === 'denied') throw new Error(`scheduler denied runner claim ${context}`);
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`scheduler claim timed out: ${context}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const repo = arg('repo', process.env.GITHUB_REPOSITORY);
  const sha = arg('sha');
  const context = arg('context');
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!repo || !sha || !context || !token) throw new Error('repo, sha, context and GITHUB_TOKEN are required');
  await waitForClaim({repo, sha, context, token, timeoutSeconds:Number(arg('timeout-seconds','90'))});
  console.log(`runner claim granted: ${context}`);
}
