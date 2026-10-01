/** Shared missing-Playwright-browser classification for browser-backed executors. */
export function isMissingBrowserExecutable(message: string): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("executable doesn't exist") ||
    lower.includes("executablenotfound") ||
    lower.includes("playwright install") ||
    (lower.includes("chromium") && lower.includes("download"))
  );
}
