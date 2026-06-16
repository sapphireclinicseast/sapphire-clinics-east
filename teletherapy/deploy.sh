#!/bin/bash
# deploy.sh — Full sync + rebuild for teletherapy on VPS
# Usage: ./deploy.sh           — refuses if local source is older than VPS
#        ./deploy.sh --force   — overrides the staleness guard
# Always run this instead of manually SCP-ing individual files.
set -e

VPS="root@152.53.231.249"
REMOTE="/var/www/sapphireclinicseast.org/teletherapy"
LOCAL="$(cd "$(dirname "$0")" && pwd)"
FORCE="${1:-}"

# ── Stale-source guard ───────────────────────────────────────
# Prevents overwriting newer code on the VPS with an older local copy
# (e.g. running this from a different machine whose Mirror/iCloud copy
# hasn't synced yet). Pass --force to override.
SENTINEL="src/app/api/patients/[id]/readmit/route.ts"  # added 2026-04-30
if [ ! -f "$LOCAL/$SENTINEL" ]; then
  echo "ERROR: Local source is missing $SENTINEL"
  echo "       Your local copy looks older than what's on the VPS."
  echo "       Sync your Mirror folder first, or pass --force to override."
  [ "$FORCE" != "--force" ] && exit 1
fi

REMOTE_NEWEST=$(ssh "$VPS" "find $REMOTE/src -type f \\( -name '*.ts' -o -name '*.tsx' \\) -printf '%T@\\n' 2>/dev/null | sort -rn | head -1 | cut -d. -f1")
LOCAL_NEWEST=$(find "$LOCAL/src" -type f \( -name '*.ts' -o -name '*.tsx' \) -print0 | xargs -0 stat -f '%m' 2>/dev/null | sort -rn | head -1)
if [ -n "$REMOTE_NEWEST" ] && [ -n "$LOCAL_NEWEST" ] && [ "$REMOTE_NEWEST" -gt "$LOCAL_NEWEST" ]; then
  REMOTE_DATE=$(date -r "$REMOTE_NEWEST" 2>/dev/null || echo "(epoch $REMOTE_NEWEST)")
  LOCAL_DATE=$(date -r "$LOCAL_NEWEST" 2>/dev/null || echo "(epoch $LOCAL_NEWEST)")
  echo "WARNING: VPS has newer source files than local."
  echo "  VPS newest:   $REMOTE_DATE"
  echo "  Local newest: $LOCAL_DATE"
  echo "  Deploying now would OVERWRITE newer changes on the VPS."
  if [ "$FORCE" != "--force" ]; then
    echo "  Refusing to deploy. Pass --force to override."
    exit 1
  fi
  echo "  --force given, proceeding anyway."
fi

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
  "$LOCAL/package.json" \
  "$LOCAL/package-lock.json" \
  "$LOCAL/next.config.ts" \
  "$LOCAL/tsconfig.json" \
  "$LOCAL/postcss.config.mjs" \
  "$VPS:$REMOTE/"

echo "==> Building on VPS (ATOMIC — into .next.new, live .next untouched)..."
# Build to a staging dir so the running app keeps serving the OLD build the
# whole time. An in-place `npm run build` overwrites .next mid-build and the
# live app 502s ("Could not find a production build" / missing build-manifest)
# until it finishes. NEXT_DIST_DIR is honoured by next.config.
ssh "$VPS" "cd $REMOTE && npm ci --prefer-offline 2>&1 | tail -5 && npx prisma generate && rm -rf .next.new && NEXT_DIST_DIR=.next.new npm run build"

echo "==> Verifying new build, then atomic-swapping it in..."
ssh "$VPS" "cd $REMOTE && if [ -f .next.new/BUILD_ID ]; then rm -rf .next.old; [ -d .next ] && mv .next .next.old; mv .next.new .next; rm -rf .next.old; echo 'swapped in new .next'; else echo 'ERROR: .next.new incomplete — keeping current .next, NOT swapping'; rm -rf .next.new; exit 1; fi"

echo "==> Ensuring INTERNAL_API_KEY is set in .env..."
ssh "$VPS" "grep -q '^INTERNAL_API_KEY=' $REMOTE/.env || echo 'WARNING: INTERNAL_API_KEY missing from .env — add it manually before the app will work'"

echo "==> Restarting PM2 process..."
ssh "$VPS" "pm2 restart scei-teletherapy --update-env"

echo ""
echo "Deploy complete."
