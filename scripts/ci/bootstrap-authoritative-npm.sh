#!/usr/bin/env bash
set -euo pipefail

repo_root="${GITHUB_WORKSPACE:-$(git rev-parse --show-toplevel)}"
toolchain_dir="$repo_root/.github/toolchains/npm"

# npm ci verifies every package against the committed package-lock integrity.
npm ci --prefix "$toolchain_dir" --ignore-scripts --no-audit --no-fund

toolchain_bin="$toolchain_dir/node_modules/.bin"
if [[ -n "${GITHUB_PATH:-}" ]]; then
  printf '%s\n' "$toolchain_bin" >> "$GITHUB_PATH"
fi

actual="$(node "$toolchain_dir/node_modules/npm/bin/npm-cli.js" --version)"
test "$actual" = "12.0.2"
echo "authoritative npm $actual ready at $toolchain_bin"
