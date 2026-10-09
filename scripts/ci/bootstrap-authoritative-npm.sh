#!/usr/bin/env bash
set -euo pipefail
repo_root="${GITHUB_WORKSPACE:-$(git rev-parse --show-toplevel)}"
target_root="${RUNNER_TEMP:-$repo_root/.cache}/agentproxy-npm-toolchain"
overlay_dir="$repo_root/docker/npm-cve-patch"
# npm ci verifies the patch overlay against its committed lockfile integrity.
npm ci --prefix "$overlay_dir" --ignore-scripts --no-audit --no-fund
node "$repo_root/scripts/ci/bootstrap-authoritative-npm.mjs" \
  "$repo_root/.github/toolchains/npm-source.json" "$target_root" "$overlay_dir/node_modules"
if [[ -n "${GITHUB_PATH:-}" ]]; then printf '%s\n' "$target_root/bin" >> "$GITHUB_PATH"; fi
export PATH="$target_root/bin:$PATH"
test "$(npm --version)" = "12.0.2"
echo "authoritative patched npm 12.0.2 ready at $target_root/bin"
