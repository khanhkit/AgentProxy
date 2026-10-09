#!/usr/bin/env bash
# AgentProxy Quickstart — cURL (Bash / Terminal)
# ==============================================
# Run:  chmod +x curl_terminal.sh && ./curl_terminal.sh
# Requires: curl (pre-installed on Mac/Linux; use Git Bash on Windows)

# Your local AgentProxy server — started with: npx agentproxy
API_URL="http://localhost:20128/v1/chat/completions"

response="$(curl "$API_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dummy-key" \
  -d '{
    "model": "auto",
    "stream": false,
    "messages": [
      { "role": "user", "content": "Hello! What can you do?" }
    ]
  }')"

python3 -c "import json,sys; print(json.loads(sys.argv[1])['choices'][0]['message']['content'])" "$response"
