import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const configUrl = pathToFileURL(path.join(projectRoot, "next.config.mjs")).href;
const require = createRequire(import.meta.url);

const expected = new Map([
  ["@/mitm/cert/install", "./src/mitm/cert/install.stub.ts"],
  ["@/lib/zed-oauth/keychain-reader", "./src/lib/zed-oauth/keychain-reader.stub.ts"],
  ["@/lib/cloudSync", "./src/lib/cloudSync.stub.ts"],
  ["@/lib/services/installers/ninerouter", "./src/lib/services/installers/ninerouter.stub.ts"],
]);

type ReplacementCallback = (resource: { request: string }) => void;

type CapturedPlugin = {
  pattern: RegExp;
  replacement: ReplacementCallback;
};

type WebpackStats = {
  hasErrors(): boolean;
  toJson(options: Record<string, boolean>): { errors?: unknown[] };
};

type WebpackCompiler = {
  run(callback: (error?: Error | null, stats?: WebpackStats) => void): void;
  close(callback: (error?: Error | null) => void): void;
};

type NormalModuleReplacementPluginConstructor = new (
  pattern: RegExp,
  replacement: ReplacementCallback
) => unknown;

type WebpackApi = ((config: Record<string, unknown>) => WebpackCompiler) & {
  NormalModuleReplacementPlugin: NormalModuleReplacementPluginConstructor;
};

const { webpack } = require("next/dist/compiled/webpack/webpack") as { webpack: WebpackApi };

type NextConfigLike = {
  turbopack: { resolveAlias: Record<string, string> };
  webpack: (
    config: Record<string, unknown>,
    options: {
      dev: boolean;
      dir: string;
      defaultLoaders: { babel: Record<string, unknown> };
      webpack: {
        NormalModuleReplacementPlugin: NormalModuleReplacementPluginConstructor;
      };
    }
  ) => Record<string, unknown>;
};

function callbackContext(webpackApi: {
  NormalModuleReplacementPlugin: NormalModuleReplacementPluginConstructor;
}) {
  return {
    dev: true,
    dir: projectRoot,
    defaultLoaders: { babel: {} },
    webpack: webpackApi,
  };
}

function baseWrappedConfig() {
  return {
    context: projectRoot,
    plugins: [] as unknown[],
    optimization: {},
    infrastructureLogging: {},
    resolve: {},
    module: { rules: [] as unknown[] },
  };
}

function captureWebpackReplacements(nextConfig: NextConfigLike): CapturedPlugin[] {
  const captured: CapturedPlugin[] = [];
  class FakeNormalModuleReplacementPlugin {
    constructor(pattern: RegExp, replacement: ReplacementCallback) {
      captured.push({ pattern, replacement });
    }
  }

  nextConfig.webpack(
    baseWrappedConfig(),
    callbackContext({ NormalModuleReplacementPlugin: FakeNormalModuleReplacementPlugin })
  );
  return captured;
}

function productionReplacementPlugins(nextConfig: NextConfigLike): unknown[] {
  const config = baseWrappedConfig();
  const result = nextConfig.webpack(config, callbackContext(webpack));
  const plugins = (result.plugins ?? config.plugins) as unknown[];
  return plugins.filter((plugin) => plugin instanceof webpack.NormalModuleReplacementPlugin);
}

function renderIssue(issue: unknown): string {
  if (typeof issue === "string") return issue;
  if (issue && typeof issue === "object" && "message" in issue) {
    return String((issue as { message: unknown }).message);
  }
  return JSON.stringify(issue);
}

async function compileTwoIssuerDepths(nextConfig: NextConfigLike): Promise<void> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-ap0104-webpack-"));
  const loaderPath = path.join(tempDir, "typescript-transpile-loader.cjs");
  const shallowDir = path.join(tempDir, "issuer");
  const deepDir = path.join(tempDir, "nested", "issuer", "depth", "four");
  const source = [
    'import { checkCertInstalled } from "@/mitm/cert/install";',
    'import { isZedInstalled } from "@/lib/zed-oauth/keychain-reader";',
    'import { CLOUD_SYNC_SECRETS_ENABLED } from "@/lib/cloudSync";',
    'import { resolveSpawnArgs } from "@/lib/services/installers/ninerouter";',
    "export const marker = [",
    "  typeof checkCertInstalled,",
    "  typeof isZedInstalled,",
    "  CLOUD_SYNC_SECRETS_ENABLED,",
    "  typeof resolveSpawnArgs,",
    "];",
  ].join("\n");

  fs.mkdirSync(shallowDir, { recursive: true });
  fs.mkdirSync(deepDir, { recursive: true });
  const shallowEntry = path.join(shallowDir, "entry.js");
  const deepEntry = path.join(deepDir, "entry.js");
  fs.writeFileSync(shallowEntry, source, "utf8");
  fs.writeFileSync(deepEntry, source, "utf8");
  fs.writeFileSync(
    loaderPath,
    [
      `const ts = require(${JSON.stringify(require.resolve("typescript"))});`,
      "module.exports = function transpileTypeScript(source) {",
      "  return ts.transpileModule(source, {",
      "    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },",
      "    fileName: this.resourcePath,",
      "  }).outputText;",
      "};",
    ].join("\n"),
    "utf8"
  );

  const plugins = productionReplacementPlugins(nextConfig);
  assert.equal(plugins.length, expected.size, "expected the four real minimal replacement plugins");

  const compiler = webpack({
    context: projectRoot,
    devtool: false,
    entry: { shallow: shallowEntry, deep: deepEntry },
    externalsPresets: { node: true },
    mode: "development",
    module: {
      rules: [{ test: /\.ts$/, use: [{ loader: loaderPath }] }],
    },
    output: {
      filename: "[name].js",
      path: path.join(tempDir, "dist"),
    },
    plugins,
    resolve: {
      alias: { "@": path.join(projectRoot, "src") },
      extensions: [".ts", ".js", ".mjs"],
    },
    target: "node",
  });

  try {
    const stats = await new Promise<WebpackStats>((resolve, reject) => {
      compiler.run((error, result) => {
        if (error) {
          reject(error);
          return;
        }
        if (!result) {
          reject(new Error("Webpack completed without stats"));
          return;
        }
        resolve(result);
      });
    });

    const report = stats.toJson({ all: false, errors: true });
    assert.equal(stats.hasErrors(), false, (report.errors ?? []).map(renderIssue).join("\n"));
    assert.equal(fs.existsSync(path.join(tempDir, "dist", "shallow.js")), true);
    assert.equal(fs.existsSync(path.join(tempDir, "dist", "deep.js")), true);
  } finally {
    await new Promise<void>((resolve, reject) => {
      compiler.close((error) => (error ? reject(error) : resolve()));
    });
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

test("AP-ISS-0104 minimal Webpack replacements are root-stable and match Turbopack targets", async () => {
  const previousProfile = process.env.AGENTPROXY_BUILD_PROFILE;
  process.env.AGENTPROXY_BUILD_PROFILE = "minimal";
  try {
    const { default: nextConfig } = (await import(`${configUrl}?ap0104=minimal-${Date.now()}`)) as {
      default: NextConfigLike;
    };
    const captured = captureWebpackReplacements(nextConfig);
    assert.equal(captured.length, expected.size);

    for (const [request, stubPath] of expected) {
      const plugin = captured.find(({ pattern }) => pattern.test(request));
      assert.ok(plugin, `missing Webpack replacement for ${request}`);

      const resource = { request };
      plugin.replacement(resource);

      assert.equal(
        path.isAbsolute(resource.request),
        true,
        `${request} replacement must be absolute`
      );
      assert.equal(resource.request, path.resolve(projectRoot, stubPath));

      const turbopackTarget = nextConfig.turbopack.resolveAlias[request];
      assert.equal(path.resolve(projectRoot, turbopackTarget), resource.request);
    }
  } finally {
    if (previousProfile === undefined) delete process.env.AGENTPROXY_BUILD_PROFILE;
    else process.env.AGENTPROXY_BUILD_PROFILE = previousProfile;
  }
});

test("AP-ISS-0104 real Webpack compilation succeeds from two issuer depths", async () => {
  const previousProfile = process.env.AGENTPROXY_BUILD_PROFILE;
  process.env.AGENTPROXY_BUILD_PROFILE = "minimal";
  try {
    const { default: nextConfig } = (await import(`${configUrl}?ap0104=compile-${Date.now()}`)) as {
      default: NextConfigLike;
    };
    await compileTwoIssuerDepths(nextConfig);
  } finally {
    if (previousProfile === undefined) delete process.env.AGENTPROXY_BUILD_PROFILE;
    else process.env.AGENTPROXY_BUILD_PROFILE = previousProfile;
  }
});

test("AP-ISS-0104 non-minimal and contributor profiles do not install privileged replacements", async () => {
  const previousProfile = process.env.AGENTPROXY_BUILD_PROFILE;
  try {
    for (const profile of [undefined, "contributor"] as const) {
      if (profile === undefined) delete process.env.AGENTPROXY_BUILD_PROFILE;
      else process.env.AGENTPROXY_BUILD_PROFILE = profile;

      const { default: nextConfig } = (await import(
        `${configUrl}?ap0104=${profile ?? "normal"}-${Date.now()}-${Math.random()}`
      )) as { default: NextConfigLike };
      assert.equal(captureWebpackReplacements(nextConfig).length, 0);
    }
  } finally {
    if (previousProfile === undefined) delete process.env.AGENTPROXY_BUILD_PROFILE;
    else process.env.AGENTPROXY_BUILD_PROFILE = previousProfile;
  }
});
