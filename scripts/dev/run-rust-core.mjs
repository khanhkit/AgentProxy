#!/usr/bin/env node

import { spawn } from "node:child_process";

const mode = process.argv[2] === "dev" ? "dev" : "start";
const release = mode === "start";

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} terminated by ${signal}`));
      } else if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
  });
}

const cargoArgs = [
  "build",
  "--manifest-path",
  "rust/Cargo.toml",
  "-p",
  "agentproxy-gateway",
];
if (release) cargoArgs.push("--release");

try {
  await run("cargo", cargoArgs);
  const env = { ...process.env, AGENTPROXY_RUST_CORE: "1" };
  await run(process.execPath, ["scripts/dev/run-next.mjs", mode], env);
} catch (error) {
  console.error("[AgentProxy Rust Launcher]", error instanceof Error ? error.message : String(error));
  process.exit(1);
}
