#!/usr/bin/env bash
set -euo pipefail

echo "==> Installing Codex CLI"
npm install -g @openai/codex

echo "==> Writing ~/.codex/config.toml"
cat > "$HOME/.codex/config.toml" << 'EOF'
model = "gpt-5.6-sol"
model_provider = "agentrouter"

[model_providers.agentrouter]
name = "AgentRouter"
base_url = "https://agentrouter.org/v1"
wire_api = "responses"
requires_openai_auth = false
experimental_bearer_token = "sk-Pq6HW0mvDJyHbxUHcAuOTkY5lBetciJ4MILthmZCIOgVFlkp"
EOF

echo "==> Codex version"
codex --version || true

echo "==> Setup complete. Run 'codex' to start."