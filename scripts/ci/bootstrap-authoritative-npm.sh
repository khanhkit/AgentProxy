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
bash_bin="$target_root/bin"
if command -v cygpath >/dev/null 2>&1; then
  bash_bin="$(cygpath -u "$target_root/bin")"
fi
export PATH="$bash_bin:$PATH"
source_version="$(node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).version)' "$repo_root/.github/toolchains/npm-source.json")"
test "$(npm --version)" = "$source_version"
echo "authoritative patched npm $source_version ready at $target_root/bin"
