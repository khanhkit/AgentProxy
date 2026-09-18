---
title: Toolchain Reproducibility Contract
---

# Toolchain Reproducibility Contract

OmniRoute uses **npm 12.0.2** and the committed `package-lock.json` as the authoritative JavaScript dependency-install contract for the default contributor, build, release, and protected-CI paths. `pnpm-workspace.yaml` and `pnpm.json` describe workspace/build metadata only; they do not make pnpm an approved unlocked install path, and `pnpm-lock.yaml` must not be introduced unless this contract is deliberately changed.

The default contributor, release, and primary CI Node.js version is **24.15.0**, recorded exactly in `.nvmrc`. This is the smallest Node 24 release accepted by npm 12.0.2, whose Node engine contract is **`^22.22.2 || ^24.15.0 || >=26.0.0`**. The toolchain checker treats Node/npm compatibility as a cross-constraint, not as two independent literal pins.

The public runtime support policy remains broader than the default build toolchain: Node **22.22.2+ on 22.x** and **24.x through 26.x** according to `src/shared/utils/nodeRuntimeSupport.ts`. The scheduled compatibility workflow therefore exercises exact representatives:

- Node **22.22.2** with authoritative npm **12.0.2**;
- Node **24.15.0** with authoritative npm **12.0.2**;
- Node **25.0.0** with its bundled npm, because npm 12.0.2 intentionally rejects Node 25.x;
- Node **26.0.0** with authoritative npm **12.0.2**.

The Node 25 lane is a runtime-compatibility exception, not a second package-manager authority. The shared `npm-ci-retry` action pins npm 12.0.2 by default and exposes `pin_authoritative_npm=false` only for this explicit compatibility case. Default/build/release/protected-CI jobs do not use that exception.

Container builds pin the Node base to `node:26.0.0-trixie-slim` and npm to `12.0.2`. Do not replace exact pins with floating major tags or `npm@latest` without an explicit toolchain-contract change.

`npm run check:toolchain-contract` is the offline fail-closed policy gate. It verifies:

- authoritative package manager and lockfile format;
- absence of a competing pnpm lock;
- exact default Node pin in `.nvmrc`;
- default Node compatibility with npm 12.0.2's engine range;
- exact Docker Node/npm pins;
- default CI Node pins in all direct/default workflow surfaces;
- the shared npm install action and its default-on authoritative npm pin;
- the explicit Node 25 bundled-npm exception;
- all supported compatibility representatives;
- alignment of runtime recommended-version metadata with the default Node pin.
