#!/usr/bin/env bash
# Template script to set GitHub Actions secrets via `gh` CLI.
# Usage: fill exported env vars or run interactively.

set -euo pipefail

# Ensure gh is installed and authenticated
if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI not found. Install from https://cli.github.com/"
  exit 1
fi

# List of secrets to set (reads value from corresponding env var)
secrets=(
  DATABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  SUPABASE_PROJECT_REF
  SUPABASE_ANON_KEY
  SUPABASE_URL
  RENDER_API_KEY
  RENDER_SERVICE_ID
  VERCEL_TOKEN
  VERCEL_PROJECT_ID
  DISCORD_TOKEN
  GEMINI_API_KEY
  SESSION_SECRET
)

for name in "${secrets[@]}"; do
  val="${!name-}"
  if [ -z "$val" ]; then
    echo "Skipping $name: no environment variable set. To set interactively run: gh secret set $name"
  else
    echo "Setting secret $name"
    printf "%s" "$val" | gh secret set "$name"
  fi
done

echo "Done. Verify secrets in GitHub repository settings."
