#!/usr/bin/env bash
set -euo pipefail

: "${REPO_URL:?REPO_URL is required}"
: "${RUNNER_NAME:?RUNNER_NAME is required}"

RUNNER_LABELS="${RUNNER_LABELS:-agentproxy-secure,kitmcp-arm64}"
RUNNER_HOME=/runner-state/actions-runner
TOKEN_FILE=/runner-state/registration-token

if [[ ! -x "$RUNNER_HOME/run.sh" ]]; then
  mkdir -p "$RUNNER_HOME"
  cp -a /opt/actions-runner/. "$RUNNER_HOME/"
fi

cd "$RUNNER_HOME"

if [[ ! -f .runner ]]; then
  if [[ ! -s "$TOKEN_FILE" ]]; then
    echo "registration token missing: $TOKEN_FILE" >&2
    exit 2
  fi
  token="$(cat "$TOKEN_FILE")"
  rm -f "$TOKEN_FILE"
  ./config.sh \
    --url "$REPO_URL" \
    --token "$token" \
    --name "$RUNNER_NAME" \
    --labels "$RUNNER_LABELS" \
    --work _work \
    --unattended \
    --replace \
    --disableupdate
  unset token
fi

exec ./run.sh
