FROM ubuntu:24.04

ARG RUNNER_VERSION=2.337.0
ARG RUNNER_SHA256=9b1dc70626422526e3c94767cf024896beb15da5342a3f4819bf2feac13e0393

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      build-essential ca-certificates curl git jq pkg-config python3 tar unzip zip \
      libicu74 libkrb5-3 liblttng-ust1t64 libssl3t64 zlib1g \
 && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --uid 1001 --shell /bin/bash runner \
 && mkdir -p /opt/actions-runner /runner-state \
 && curl -fsSL \
      "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-arm64-${RUNNER_VERSION}.tar.gz" \
      -o /tmp/actions-runner.tgz \
 && echo "${RUNNER_SHA256}  /tmp/actions-runner.tgz" | sha256sum -c - \
 && tar -xzf /tmp/actions-runner.tgz -C /opt/actions-runner \
 && rm /tmp/actions-runner.tgz \
 && chown -R runner:runner /opt/actions-runner /runner-state

COPY --chmod=0755 entrypoint.sh /usr/local/bin/agentproxy-runner-entrypoint

USER runner
WORKDIR /runner-state
ENTRYPOINT ["/usr/local/bin/agentproxy-runner-entrypoint"]
