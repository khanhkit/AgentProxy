---
title: Toolchain Reproducibility Contract
---

# Toolchain Reproducibility Contract

OmniRoute uses **npm 12.0.2** and the committed `package-lock.json` as the authoritative JavaScript dependency-install contract. `pnpm-workspace.yaml` and `pnpm.json` describe workspace/build metadata only; they do not make pnpm an approved unlocked install path, and `pnpm-lock.yaml` must not be introduced unless this contract is deliberately changed.

The default contributor, release, and primary CI Node.js version is **24.14.1**, recorded exactly in `.nvmrc`. The public runtime support policy remains broader: Node **22.22.2+ on 22.x** and **24.x through 26.x** according to `src/shared/utils/nodeRuntimeSupport.ts`. The scheduled compatibility workflow therefore exercises exact representatives `22.22.2`, `24.14.1`, `25.0.0`, and `26.0.0`; these compatibility lanes do not replace the pinned default build toolchain.

Container builds pin the Node base to `node:26.0.0-trixie-slim` and npm to `12.0.2`. CI install paths pin npm before running `npm ci`. Do not replace exact pins with floating major tags or `npm@latest` without an explicit toolchain-contract change.

`npm run check:toolchain-contract` is the offline fail-closed policy gate. It verifies the authoritative manager, lockfile format, absence of a competing pnpm lock, exact `.nvmrc`, exact Docker Node/npm pins, default CI Node pins, the shared npm install action, and all supported-major compatibility representatives.
