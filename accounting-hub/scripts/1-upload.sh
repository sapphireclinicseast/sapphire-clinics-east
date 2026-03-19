#!/bin/bash
# ============================================================
# SAPPHIRE Accounting Hub — Step 1: Upload code to VPS
# ============================================================
# Run this from your Mac, inside the accounting-hub folder.
# Usage:  bash scripts/1-upload.sh root@YOUR_VPS_IP
# ============================================================

set -e

SERVER="${1}"

if [ -z "$SERVER" ]; then
  echo ""
  echo "  Missing server address."
  echo "    Usage: bash scripts/1-upload.sh root@YOUR_VPS_IP"
  echo ""
  exit 1
fi

echo ""
echo "  SAPPHIRE Accounting Hub — Uploading to $SERVER"
echo ""
echo "  Syncing project files..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

rsync -avz --progress \
  -e "ssh -i ~/.ssh/scei_deploy" \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.env' \
  --exclude '.git' \
  --exclude '*.log' \
  "$PROJECT_ROOT/" \
  "$SERVER:/opt/accounting/"

echo ""
echo "  Upload complete! Files are at /opt/accounting/ on the server."
echo ""
echo "  Next steps:"
echo "  1. SSH into your server:  ssh -i ~/.ssh/scei_deploy $SERVER"
echo "  2. Create .env:  cp /opt/accounting/docker/.env.production.example /opt/accounting/docker/.env.production"
echo "  3. Edit secrets:  nano /opt/accounting/docker/.env.production"
echo "  4. Start app:  bash /opt/accounting/scripts/2-start-app.sh"
echo ""
