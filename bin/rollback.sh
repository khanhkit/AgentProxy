#!/usr/bin/env bash
# bin/rollback.sh — roll AgentProxy back to a previous release to mitigate a bad
# deploy. Part of the deploy-rollback incident-recovery flow.
#
# Supported method:
#   • docker — re-tag the local image agentproxy:<version> to agentproxy:prod and
#              recreate the prod service from docker-compose.prod.yml. (That
#              compose builds the `prod` tag locally rather than pulling a
#              registry tag, so the versioned image must already exist locally.)
#
# npm rollback is intentionally fail-closed until AgentProxy has an immutable,
# provenance-bound published package channel. The current repository has no such
# authority, so resolving/installing dependencies from a mutable registry would not
# be a trustworthy rollback.
set -euo pipefail
SCRIPT_NAME="rollback"
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_ops-common.sh"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'EOF'
Usage: bin/rollback.sh <version> [--method docker] [--yes|-y] [-h|--help]

Rolls AgentProxy back to an explicitly selected local Docker image version.
npm rollback is unavailable until an immutable published package authority is configured.
EOF
}

VERSION=""
METHOD=""
while [ $# -gt 0 ]; do
  case "$1" in
    --yes | -y) ASSUME_YES=1; shift ;;
    --method) METHOD="${2:?--method needs npm|docker}"; shift 2 ;;
    -h | --help) usage; exit 0 ;;
    -*) ops_die "unknown argument: $1 (see --help)" ;;
    *) VERSION="${1#v}"; shift ;;
  esac
done

if [ "$METHOD" = "npm" ]; then
  ops_die "npm rollback is unavailable: no immutable published package authority is configured"
fi

if [ -z "$METHOD" ]; then
  if command -v docker >/dev/null 2>&1 && [ -f "$REPO_ROOT/docker-compose.prod.yml" ] \
    && docker compose -f "$REPO_ROOT/docker-compose.prod.yml" ps -q 2>/dev/null | grep -q .; then
    METHOD="docker"
  else
    ops_die "no safe rollback method detected — npm rollback is unavailable and no running prod Docker compose was found"
  fi
fi

[ "$METHOD" = "docker" ] || ops_die "unknown or unavailable method: $METHOD (supported: docker)"
[ -n "$VERSION" ] || ops_die "explicit version required for rollback; mutable registry version discovery is disabled"

ops_log "target: agentproxy@$VERSION via $METHOD"
ops_confirm "Roll AgentProxy back to $VERSION via $METHOD?" || ops_die "aborted"

case "$METHOD" in
  docker)
    ops_require_cmd docker
    if ! docker image inspect "agentproxy:$VERSION" >/dev/null 2>&1; then
      ops_die "local image agentproxy:$VERSION not found — build it from the $VERSION checkout first (this compose builds the 'prod' tag, it does not pull a registry tag)"
    fi
    docker tag "agentproxy:$VERSION" agentproxy:prod
    docker compose -f "$REPO_ROOT/docker-compose.prod.yml" up -d --no-build
    ops_log "recreated prod service from agentproxy:$VERSION"
    ;;
  *) ops_die "unknown method: $METHOD (supported: docker)" ;;
esac
ops_log "rollback to $VERSION complete"
