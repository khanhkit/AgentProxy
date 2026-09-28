#!/usr/bin/env node
const key = process.env.WINDSURF_API_KEY || "";
process.exit(key === "apk_user_valid_cli_key" ? 0 : 17);
