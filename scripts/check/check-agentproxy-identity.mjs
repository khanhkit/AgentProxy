#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const LEGACY_TOKENS = [
  ["omni", "route"].join(""),
  ["omni", "router"].join(""),
  ["ommi", "router"].join(""),
];

const LEGACY_PATTERN = new RegExp(LEGACY_TOKENS.join("|"), "i");

export function isHistoricalContentPath(file) {
  return file === "CHANGELOG.md" || /^docs\/i18n\/[^/]+\/CHANGELOG\.md$/i.test(file);
}

export function findIdentityViolations(files, readFile) {
  const violations = [];
  for (const file of files) {
    if (LEGACY_PATTERN.test(file)) {
      violations.push({ kind: "path", file });
    }

    if (isHistoricalContentPath(file)) continue;

    let buffer;
    try {
      buffer = readFile(file);
    } catch {
      continue;
    }
    if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(String(buffer));
    if (buffer.includes(0)) continue;

    const text = buffer.toString("utf8");
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (LEGACY_PATTERN.test(lines[index])) {
        violations.push({
          kind: "content",
          file,
          line: index + 1,
          sample: lines[index].trim().slice(0, 220),
        });
      }
    }
  }
  return violations;
}

function listCandidateFiles() {
  const out = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { encoding: "buffer", maxBuffer: 128 * 1024 * 1024 }
  );
  return out
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter((file) => file !== "node_modules")
    .filter((file) => fs.existsSync(file));
}

function main() {
  const files = listCandidateFiles();
  const violations = findIdentityViolations(files, (file) => fs.readFileSync(file));
  if (violations.length === 0) {
    console.log("[agentproxy-identity] OK — no active former-base identity remains");
    return;
  }

  console.error(
    "[agentproxy-identity] FAIL — " + violations.length + " active legacy identity hit(s)"
  );
  for (const item of violations.slice(0, 250)) {
    if (item.kind === "path") {
      console.error("PATH " + item.file);
    } else {
      console.error("CONTENT " + item.file + ":" + item.line + ": " + item.sample);
    }
  }
  if (violations.length > 250) {
    console.error("... " + (violations.length - 250) + " additional hit(s) omitted");
  }
  process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main();
}
