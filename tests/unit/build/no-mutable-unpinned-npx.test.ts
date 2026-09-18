import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
const exactPackageSpec = /^(?:@[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+|[A-Za-z0-9._-]+)@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function mutableNpxInvocations(source: string): string[] {
  return [...source.matchAll(/\bnpx\s+(?:--yes|-y)\s+(\S+)/g)]
    .map((match) => match[1])
    .filter((packageSpec) => !exactPackageSpec.test(packageSpec));
}

test("mutable npx detection rejects unpinned/tagged/ranged specs and accepts exact versions", () => {
  const source = [
    "npx --yes markdownlint-cli2",
    "npx -y markdownlint-cli2@latest",
    "npx --yes markdownlint-cli2@^0.23.2",
    "npx --yes markdownlint-cli2@0.23.2",
    "npx --yes @scope/tool@1.2.3",
  ].join("\n");

  assert.deepEqual(mutableNpxInvocations(source), [
    "markdownlint-cli2",
    "markdownlint-cli2@latest",
    "markdownlint-cli2@^0.23.2",
  ]);
});

test("repository build/lint execution never uses mutable unpinned npx --yes packages", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  const executableSurface = [
    ...Object.entries(pkg.scripts ?? {}).map(([name, command]) => [`package.json#scripts.${name}`, command] as const),
    [".github/workflows/ci.yml", fs.readFileSync(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8")] as const,
  ];

  const violations = executableSurface.flatMap(([location, source]) =>
    mutableNpxInvocations(source).map((packageSpec) => `${location}: ${packageSpec}`)
  );

  assert.deepEqual(
    violations,
    [],
    "mutable npx --yes/-y package execution is not allowed without an exact immutable version"
  );
});

test("mutable-tool replacements are exact direct devDependencies and lockfile entries", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
    devDependencies?: Record<string, string>;
  };
  const lock = JSON.parse(fs.readFileSync(path.join(repoRoot, "package-lock.json"), "utf8")) as {
    packages?: Record<string, { version?: string }>;
  };

  const expected = {
    "markdownlint-cli2": "0.23.2",
    "node-gyp": "12.4.0",
  } as const;

  for (const [name, version] of Object.entries(expected)) {
    assert.equal(pkg.devDependencies?.[name], version, `${name} must be a direct exact devDependency`);
    assert.equal(lock.packages?.[`node_modules/${name}`]?.version, version, `${name} lockfile version must match`);
  }
});
