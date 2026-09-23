#!/usr/bin/env node

import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const GLOB_MAGIC = /[*?\[\]{}]/u;
const ROOT_AUTHORITY_FILES = ["package.json", ".npmignore", ".gitignore"];

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function exists(target) {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function normalizeLiteralEntry(entry) {
  if (typeof entry !== "string" || entry.length === 0) {
    throw new Error("package.json#files positive entries must be non-empty strings");
  }
  if (entry.includes("\\") || path.posix.isAbsolute(entry) || /^[A-Za-z]:[\\/]/u.test(entry)) {
    throw new Error(`unsafe package files entry: ${entry}`);
  }
  if (GLOB_MAGIC.test(entry)) {
    throw new Error(
      `positive package files entry must be a literal path for bounded staging: ${entry}`,
    );
  }

  const trimmed = entry.replace(/^\.\//u, "").replace(/\/+$/u, "");
  const normalized = path.posix.normalize(trimmed);
  if (
    normalized === "" ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    throw new Error(`unsafe package files entry: ${entry}`);
  }
  return normalized;
}

export function literalPositiveEntries(manifest) {
  if (!Array.isArray(manifest?.files)) {
    throw new Error(
      "bounded npm staging requires package.json#files to be an explicit array",
    );
  }

  return [
    ...new Set(
      manifest.files
        .filter((entry) => typeof entry === "string" && !entry.startsWith("!"))
        .map(normalizeLiteralEntry),
    ),
  ];
}

function manifestAutoIncludedEntries(manifest) {
  const values = [];
  if (typeof manifest?.main === "string") values.push(manifest.main);

  if (typeof manifest?.bin === "string") {
    values.push(manifest.bin);
  } else if (manifest?.bin && typeof manifest.bin === "object") {
    values.push(...Object.values(manifest.bin).filter((value) => typeof value === "string"));
  }

  if (typeof manifest?.man === "string") {
    values.push(manifest.man);
  } else if (Array.isArray(manifest?.man)) {
    values.push(...manifest.man.filter((value) => typeof value === "string"));
  }

  return values.map(normalizeLiteralEntry);
}

async function rootAutoIncludedDocs(sourceDir) {
  const names = await readdir(sourceDir);
  return names.filter((name) =>
    /^(?:readme|licen[cs]e|copying|notice)(?:\..*)?$/iu.test(name),
  );
}

export async function buildPublishStage({ sourceDir, stageDir }) {
  const source = path.resolve(sourceDir);
  const stage = path.resolve(stageDir);

  if (isWithin(source, stage) || isWithin(stage, source)) {
    throw new Error("publish staging directory must be outside the source tree");
  }

  const manifestPath = path.join(source, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const entries = [
    ...literalPositiveEntries(manifest),
    ...manifestAutoIncludedEntries(manifest),
    ...(await rootAutoIncludedDocs(source)),
  ];

  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });

  let prunedNodeModules = 0;
  const copied = new Set();

  const copyRelative = async (relative, { metadata = false } = {}) => {
    const normalized = metadata ? relative : normalizeLiteralEntry(relative);
    if (copied.has(normalized)) return;

    const sourcePath = path.join(source, ...normalized.split("/"));
    if (!(await exists(sourcePath))) return;

    const destinationPath = path.join(stage, ...normalized.split("/"));
    await mkdir(path.dirname(destinationPath), { recursive: true });

    await cp(sourcePath, destinationPath, {
      recursive: true,
      force: true,
      errorOnExist: false,
      preserveTimestamps: true,
      verbatimSymlinks: true,
      filter: async (candidate) => {
        const relativeCandidate = path.relative(source, candidate);
        const segments = relativeCandidate.split(path.sep);
        if (segments.includes("node_modules")) {
          if (path.basename(candidate) === "node_modules") prunedNodeModules += 1;
          return false;
        }
        return true;
      },
    });
    copied.add(normalized);
  };

  for (const metadata of ROOT_AUTHORITY_FILES) {
    await copyRelative(metadata, { metadata: true });
  }
  for (const entry of entries) {
    await copyRelative(entry);
  }

  return {
    sourceDir: source,
    stageDir: stage,
    copiedEntries: [...copied].sort(),
    prunedNodeModules,
  };
}

function parseArgs(argv) {
  let sourceDir = process.cwd();
  let stageDir;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--source") {
      sourceDir = argv[++index];
    } else if (arg === "--output") {
      stageDir = argv[++index];
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (!stageDir) throw new Error("--output <directory> is required");
  return { sourceDir, stageDir };
}

async function main() {
  const result = await buildPublishStage(parseArgs(process.argv.slice(2)));
  process.stdout.write(
    JSON.stringify(
      {
        stageDir: result.stageDir,
        copiedEntries: result.copiedEntries.length,
        prunedNodeModules: result.prunedNodeModules,
      },
      null,
      2,
    ) + "\n",
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(`[stage-npm-package] ${error?.stack || error}`);
    process.exitCode = 1;
  });
}
