#!/bin/bash
# deploy.sh — Full sync + rebuild for accounting-hub on VPS
# Usage: ./deploy.sh
# Always run this instead of manually SCP-ing individual files.
#
# Failure handling: every step is checked and the script stops at the first
# problem, loudly. It used to report "Deploy complete" after a failed build,
# and exit 0 through a pipe, which hid two broken deploys.
#
# Order matters. Migrations (docker/redeploy.sh) go first, then the schema,
# then the code that depends on both. A transfer that dies halfway therefore
# leaves the server with migrations ahead of the code — never behind it, which
# is the state that takes the app down (Prisma querying a column the database
# does not have yet).
set -Eeuo pipefail

VPS="root@152.53.231.249"
REMOTE="/opt/accounting"
LOCAL="$(cd "$(dirname "$0")" && pwd)"

RSYNC_OPTS=(-avz --partial --timeout=90 -e "ssh -o ConnectTimeout=25 -o ServerAliveInterval=10 -o ServerAliveCountMax=6")

fail() { echo ""; echo "DEPLOY FAILED at: $1" >&2; echo "Nothing was rebuilt. The running app is untouched." >&2; exit 1; }

# The link to the VPS drops often enough that a single blip should not abort a
# deploy; --partial means a retry resumes rather than restarts.
retry_rsync() {
  local what="$1"; shift
  local attempt
  for attempt in 1 2 3; do
    if rsync "${RSYNC_OPTS[@]}" "$@"; then return 0; fi
    echo "   ...$what failed (attempt $attempt/3), retrying" >&2
    sleep 5
  done
  fail "$what"
}

echo "==> 1/5 Syncing migrations + compose (must land before the schema)..."
retry_rsync "docker/ sync" \
  "$LOCAL/docker/docker-compose.yml" \
  "$LOCAL/docker/redeploy.sh" \
  "$VPS:$REMOTE/docker/"

echo "==> 2/5 Syncing prisma schema..."
retry_rsync "schema.prisma sync" \
  "$LOCAL/prisma/schema.prisma" \
  "$VPS:$REMOTE/prisma/schema.prisma"

echo "==> 3/5 Syncing public assets..."
retry_rsync "public/ sync" \
  --exclude='uploads' \
  "$LOCAL/public/" \
  "$VPS:$REMOTE/public/"

echo "==> 4/5 Syncing source..."
retry_rsync "src/ sync" --delete \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='uploads' \
  --exclude='.git' \
  --exclude='*.log' \
  "$LOCAL/src/" "$VPS:$REMOTE/src/"

echo "==> 5/5 Rebuilding on VPS..."
ssh -o ConnectTimeout=25 -o ServerAliveInterval=10 -o ServerAliveCountMax=6 \
  "$VPS" "bash $REMOTE/docker/redeploy.sh" || fail "remote build (redeploy.sh)"

# The build can succeed and the container still fail to come up, so confirm it.
echo "==> Verifying the app is serving..."
ssh -o ConnectTimeout=25 "$VPS" \
  'docker ps --filter name=accounting_app --format "{{.Status}}" | grep -q "^Up" \
     && curl -sf -o /dev/null -m 20 http://127.0.0.1:3000/login' \
  || fail "post-deploy health check (build finished, app is not serving)"

echo ""
echo "Deploy complete and verified. Ask all users to log out and back in."
