#!/usr/bin/env bash
# Runs after Codespace / devcontainer attaches — prints quick-start hints.
set -euo pipefail

echo ""
echo "=============================================="
echo " SyncScript dev environment ready"
echo "=============================================="
echo ""
echo " Redis:    redis://localhost:6379 (shared network with this container)"
echo " Signaling: npm run start:stack   (Redis + server on port 4444)"
echo " Extension: npm run package:vsix   -> artifacts/syncscript.vsix"
echo " Tests:     npm test"
echo ""
if redis-cli -h localhost ping 2>/dev/null | grep -q PONG; then
  echo " [OK] Redis is reachable"
else
  echo " [!!] Redis not responding yet — wait a few seconds and retry"
fi
echo ""
