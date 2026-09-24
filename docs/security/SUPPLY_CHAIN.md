---
title: "Supply-Chain Gates"
---

# Supply-Chain Gates

AgentProxy protects source dependencies, native Rust code, container releases, and
native release assets with fail-closed CI/release controls. Third-party GitHub
Actions are SHA-pinned; Dependabot owns version refreshes.

> **npm status:** the legacy `.github/workflows/npm-publish.yml` was deliberately
> removed by the 2026-09-13 release-pipeline hardening change. Packaging and
> post-publish verification code still exists, but there is currently no active npm
> publication workflow. This document therefore makes no npm provenance/SBOM claim.

## Active controls

| Surface | Control | Workflow | Enforcement |
| --- | --- | --- | --- |
| PR dependency delta | `actions/dependency-review-action` | `ci.yml` → `Dependency Review` | **Blocking** through the required `Security Tests` context |
| Rust correctness | rustfmt + Clippy `-D warnings` + workspace/contract tests | `ci.yml` → `Rust Quality` | **Blocking** for Rust/workflow changes through `Security Tests` |
| Rust dependency security | `cargo-deny` advisories/licenses/bans/sources | `ci.yml` → `Rust Quality` | **Blocking** for Rust/workflow changes through `Security Tests` |
| JS dependency CVEs | `osv-scanner` vulnerability ratchet | `ci.yml` → extended quality gates | **Blocking on a measured regression**; measurement failures self-skip |
| Secrets | Gitleaks ratchet | `ci.yml` → extended quality gates | **Blocking on a measured regression** |
| Workflow security | actionlint + zizmor ratchet | `ci.yml` → extended quality gates | **Blocking on configured hard rules/regressions** |
| Container provenance | BuildKit `provenance: mode=max` | `docker-publish.yml` | **Blocking** as part of image build/push |
| Container SBOM | BuildKit `sbom: true` | `docker-publish.yml` | **Blocking** as part of image build/push |
| Container CVEs | Trivy OS + library scan, HIGH/CRITICAL | `docker-publish.yml` | **Blocking** for every platform image |
| OCI manifest attestation | GitHub `actions/attest` + registry publication | `docker-publish.yml` | **Blocking** before signature |
| OCI signature | Cosign keyless OIDC sign + verify | `docker-publish.yml` | **Blocking** |
| Native release provenance | GitHub `actions/attest` over collected native assets | `release-platforms.yml` | **Blocking** before GitHub Release upload |
| Privileged release runner visibility | StepSecurity Harden-Runner, `egress-policy: audit` | container/native publish jobs | Observability/hardening on the high-privilege jobs |
| Repository posture | OpenSSF Scorecard → SARIF + published result | `scorecard.yml` | Advisory, weekly + branch-protection changes |
| Documentation links | Lychee | `links.yml` | Advisory, weekly |

## Required merge-path design

The protected `main` branch already requires the stable `Security Tests`
GitHub Actions context. New PR dependency and Rust gates are intentionally wired
as prerequisites of that existing context rather than being added immediately as
new branch-protection contexts.

This preserves fail-closed behavior without creating an unobserved required
context that could deadlock merges. Any future required-check migration must
follow `docs/architecture/GITHUB_GOVERNANCE_POLICY.md` and
`config/quality/github-governance-policy.json`.

## Rust dependency policy

`deny.toml` is the committed Rust supply-chain policy. It evaluates the native
release targets:

- Linux x64 and ARM64
- Windows x64 and ARM64
- macOS x64 and ARM64

The policy blocks RustSec advisories, unapproved licenses, unknown registries,
and unknown Git sources. Duplicate transitive versions and existing internal
path-dependency wildcards are warnings so the gate can ratchet real dependency
risk without forcing unrelated dependency-graph churn.

A Rust or `deny.toml` change activates the Rust CI lane. Workflow changes also
activate it so edits to the gate cannot merge without exercising the gate itself.

## CVE variance and remediation

Security databases change independently of source changes. A previously green
dependency or image can therefore become red after a new advisory is published.

Preferred remediation order:

1. Upgrade the affected dependency or base image to a fixed release.
2. Verify tests and release contracts after the upgrade.
3. Only when no fix exists, document an explicit, narrowly scoped exception with
   a tracking issue and review date. Do not suppress a new advisory merely to
   restore a green dashboard.

The Rust advisory gate is fail-closed. The JS OSV ratchet distinguishes a real
measured regression from a scanner/network measurement failure. Container Trivy
scans use `ignore-unfixed: false`, so HIGH/CRITICAL findings remain visible and
blocking regardless of fix availability.

## Release attestations

Native files are attested before they are attached to a GitHub Release. The final
multi-architecture container manifest is attested by immutable digest and pushed
to the OCI registry, then independently signed and verified with Cosign.

This gives release consumers two complementary verification paths:

- GitHub artifact attestations for build provenance
- Sigstore/Cosign verification for the published OCI manifest

Harden-Runner is deliberately limited to the privileged publish jobs first. Its
egress policy starts in audit mode so normal release traffic can be observed
before any deny-list/allow-list enforcement is introduced.
