export function registerProvider(program) {
  program
    .command("provider [subcommand]")
    .description("Manage provider connections (use 'providers' for the full interface)")
    .allowUnknownOption()
    .allowExcessArguments()
    .action(() => {
      console.log(`
  Use \`agentproxy providers\` for the full provider management interface:

    agentproxy providers available   — show provider catalog
    agentproxy providers list        — list configured connections
    agentproxy providers test <name> — test a provider connection
    agentproxy providers test-all    — test all active connections
    agentproxy providers validate    — validate local configuration
    agentproxy providers add <id>    — add an API-key connection
    agentproxy providers auth <id>   — start an existing OAuth flow
    agentproxy providers remove <id> — remove a connection (requires confirmation)
`);
    });
}
