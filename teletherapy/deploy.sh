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

echo "==> Ensuring INTERNAL_API_KEY is set in .env..."
ssh "$VPS" "grep -q '^INTERNAL_API_KEY=' $REMOTE/.env || echo 'WARNING: INTERNAL_API_KEY missing from .env — add it manually before the app will work'"

echo "==> Building + swapping + restarting on VPS (atomic + serialized)..."
# Hold the source-guard's lock for the WHOLE build->swap->restart so this
# deploy can't run concurrently with the guard's self-heal OR another agent's
# deploy. Multiple agents share one SSH key and sometimes deploy at the same
# time; two concurrent `npm ci`/builds corrupt node_modules/.next. -w 900 waits
# up to 15 min for an in-flight build to finish. The build is atomic (.next.new)
# so the live app serves the old build until the sub-second swap + restart.
ssh "$VPS" "flock -w 900 /var/run/teletherapy-source-guard.lock bash -s" <<DEPLOY_EOF
set -eo pipefail
cd "$REMOTE"
echo "  (lock acquired) npm ci ..."
npm ci --prefer-offline 2>&1 | tail -5
npx prisma generate
rm -rf .next.new
NEXT_DIST_DIR=.next.new NEXT_TELEMETRY_DISABLED=1 npm run build
if [ ! -f .next.new/BUILD_ID ]; then
  echo "  ERROR: .next.new incomplete — keeping current .next, NOT swapping/restarting"
  rm -rf .next.new
  exit 1
fi
rm -rf .next.old
[ -d .next ] && mv .next .next.old
mv .next.new .next
rm -rf .next.old
echo "  swapped in new .next"
pm2 restart scei-teletherapy --update-env
echo "  pm2 restarted"
DEPLOY_EOF

echo ""
echo "Deploy complete."
