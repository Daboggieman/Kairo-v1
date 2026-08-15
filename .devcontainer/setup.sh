#!/usr/bin/env bash
set -euo pipefail

echo "==> Installing Codex CLI"
npm install -g @openai/codex

echo "==> Writing ~/.codex/config.toml"
mkdir -p "$HOME/.codex"

cat > "$HOME/.codex/config.toml" << 'EOF'
model = "gpt-5.6-sol"
model_provider = "agentrouter"

[model_providers.agentrouter]
name = "AgentRouter"
base_url = "https://agentrouter.org/v1"
wire_api = "responses"
requires_openai_auth = false
env_key = "AGENTROUTER_API_KEY"
EOF

echo "==> Verifying environment"
if [ -z "${AGENTROUTER_API_KEY:-}" ]; then
  echo "WARNING: AGENTROUTER_API_KEY is not set in this Codespace."
  echo "Add it under GitHub Settings -> Codespaces secrets (personal or repo-level)"
  echo "and rebuild the container, otherwise Codex will fail to authenticate."
else
  echo "AGENTROUTER_API_KEY is present (length: ${#AGENTROUTER_API_KEY} chars)."
fi

echo "==> Codex version"
codex --version || true

echo "==> Setup complete. Run 'codex' to start."