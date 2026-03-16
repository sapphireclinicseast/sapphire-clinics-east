#!/bin/bash
# ============================================================
# SAPPHIRE Marketing Hub — Step 1: Upload code to VPS
# ============================================================
# Run this from your Mac, inside the sapphire-marketing-hub folder.
# Usage:  bash scripts/1-upload.sh root@YOUR_VPS_IP
# ============================================================

set -e

SERVER="${1}"

if [ -z "$SERVER" ]; then
  echo ""
  echo "❌  Missing server address."
  echo "    Usage: bash scripts/1-upload.sh root@YOUR_VPS_IP"
  echo "    Example: bash scripts/1-upload.sh root@123.456.789.0"
  echo ""
  exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  SAPPHIRE Marketing Hub — Uploading to $SERVER"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "→ Syncing project files (this may take 1–2 minutes)..."

# Find the project root (one level up from this scripts/ folder)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

rsync -avz --progress \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.env' \
  --exclude 'uploads/*' \
  --exclude '.git' \
  --exclude '*.log' \
  "$PROJECT_ROOT/" \
  "$SERVER:/opt/sapphire/"

echo ""
echo "✅  Upload complete! Files are at /opt/sapphire/ on the server."
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Next step:"
echo ""
echo "  1. SSH into your server:"
echo "     ssh $SERVER"
echo ""
echo "  2. Then run:"
echo "     bash /opt/sapphire/scripts/2-server-setup.sh"
echo "═══════════════════════════════════════════════════════"
echo ""
