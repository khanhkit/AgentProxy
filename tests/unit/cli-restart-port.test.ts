import test from "node:test";
import assert from "node:assert/strict";
import { Command } from "commander";

async function parseRestart(args: string[]) {
  const { registerRestart } = await import("../../bin/cli/commands/restart.mjs");
  const program = new Command().exitOverride();
  registerRestart(program);
  let parsed: Record<string, unknown> | undefined;
  program.commands
    .find((cmd) => cmd.name() === "restart")!
    .action((opts: Record<string, unknown>) => {
      parsed = opts;
    });
  await program.parseAsync(["restart", ...args], { from: "user" });
  return parsed;
}

test("restart without --port leaves the port to runServe's PORT fallback", async () => {
  const opts = await parseRestart([]);
  assert.equal(opts?.port, undefined);
});

test("restart --port still passes the explicit port", async () => {
  const opts = await parseRestart(["--port", "3000"]);
  assert.equal(opts?.port, "3000");
});
