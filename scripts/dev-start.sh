#!/usr/bin/env bash
# ============================================================================
# dev-start.sh — Ask about DB sync, then start backend + frontend
# ============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Only ask if .sync-env is configured
if [[ -f "$SCRIPT_DIR/.sync-env" ]]; then
  echo ""
  read -p "Sync production DB before starting? (y/n) " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    bash "$SCRIPT_DIR/sync-db.sh" --no-prompt
  fi
fi

echo ""
echo "Starting dev servers..."
npx concurrently -n back,front -c blue,green \
  "cd backend && npm run dev" \
  "cd frontend && npm run dev -- --host"