#!/bin/bash
# deploy.sh — Full sync + rebuild for accounting-hub on VPS
# Usage: ./deploy.sh
# Always run this instead of manually SCP-ing individual files.
set -e

VPS="root@152.53.231.249"
REMOTE="/opt/accounting"
LOCAL="$(cd "$(dirname "$0")" && pwd)"

echo "==> Syncing source files to VPS..."
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='uploads' \
  --exclude='.git' \
  --exclude='*.log' \
  "$LOCAL/src/" "$VPS:$REMOTE/src/"

rsync -avz \
  "$LOCAL/prisma/schema.prisma" \
  "$VPS:$REMOTE/prisma/schema.prisma"

rsync -avz \
  --exclude='uploads' \
  "$LOCAL/public/" \
  "$VPS:$REMOTE/public/"

rsync -avz \
  "$LOCAL/docker/docker-compose.yml" \
  "$LOCAL/docker/redeploy.sh" \
  "$VPS:$REMOTE/docker/"

echo "==> Rebuilding on VPS..."
ssh "$VPS" "bash $REMOTE/docker/redeploy.sh"

echo ""
echo "Deploy complete. Ask all users to log out and back in."
