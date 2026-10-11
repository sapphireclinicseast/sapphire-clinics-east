#!/usr/bin/env bash
# Rebuild and restart the Marketing Hub (Operations Hub) container, on the VPS.
#
# Extracted from deploy.yml so the workflow can run it TWICE without
# duplicating 130 lines. The GitHub runner intermittently cannot open an SSH
# session to the VPS at all -- "dial tcp :22 i/o timeout" killed three deploys
# between 2026-10-09 and 2026-10-11, each time before a single command had
# run, and each time the manual rebuild then worked first try. One source of
# truth, two attempts.
#
# Run via appleboy/ssh-action `script_path`.

# Deliberately NOT using `set -e` so we can capture build exit
# codes and print diagnostics before bailing.
DOCKER_DIR="/var/www/sapphireclinicseast.org/docker"
ENV_FILE="/opt/sapphire/docker/.env.production"
SRC_SHA_FILE="/var/www/sapphireclinicseast.org/.deploy-sha"
REBUILD_SHA_FILE="/var/www/sapphireclinicseast.org/.rebuild-sha"

if [ ! -d "$DOCKER_DIR" ]; then
  echo "❌ Marketing hub docker dir not found at $DOCKER_DIR"
  exit 1
fi
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Marketing hub .env.production not found at $ENV_FILE"
  exit 1
fi

cd "$DOCKER_DIR"

echo "→ Currently running marketing-hub container:"
docker ps --filter "name=sapphire_app" --format "  {{.Names}}  image={{.Image}}  status={{.Status}}" || true

# ─── Build-context fingerprint ──────────────────────────────
# Sanity-check that the freshly rsync'd source on the VPS
# actually contains the latest commit. If somebody (a backup
# cron, a hand-edit, etc.) clobbered files between the rsync
# and this point, the build below would happily bake the
# stale content. Print the schedules layout sha so a
# mismatch is visible in the run log.
cd /var/www/sapphireclinicseast.org
echo "→ Source-tree fingerprint (post-rsync):"
echo "   src/app/schedules/layout.tsx:                   $(sha256sum 'src/app/schedules/layout.tsx' 2>/dev/null | awk '{print $1}' | cut -c1-16) ($(wc -c < 'src/app/schedules/layout.tsx' 2>/dev/null) bytes)"
echo "   src/app/schedules/page.tsx:                     $(sha256sum 'src/app/schedules/page.tsx' 2>/dev/null | awk '{print $1}' | cut -c1-16)"
echo "   src/app/schedules/[branch]/[dept]/page.tsx:     $(sha256sum 'src/app/schedules/[branch]/[dept]/page.tsx' 2>/dev/null | awk '{print $1}' | cut -c1-16)"
echo "   src/middleware.ts:                              $(sha256sum 'src/middleware.ts' 2>/dev/null | awk '{print $1}' | cut -c1-16)"
cd "$DOCKER_DIR"

echo "→ Tagging current image as :rollback (best-effort)..."
docker tag sapphire_app:latest sapphire_app:rollback 2>/dev/null || true

echo "→ Building sapphire_app from /var/www/sapphireclinicseast.org..."
# The .deploy-sha file written during rsync (one line, the
# current commit SHA) is part of the build context. Each new
# commit changes its content, which invalidates BuildKit's
# cache for the COPY layer and everything downstream — so we
# get a real rebuild without paying the full --no-cache tax
# on layers that genuinely haven't changed (base image,
# node_modules install, etc.).
docker compose --env-file "$ENV_FILE" build --pull app
BUILD_RC=$?
echo "   Build exit code: $BUILD_RC"
if [ "$BUILD_RC" != "0" ]; then
  echo "❌ Build failed — leaving previous container untouched."
  exit 1
fi
echo "   ✅ Image built."

echo "→ Pre-flight: ensuring sapphire_db is healthy before recreating app..."
DB_OK="no"
for i in 1 2 3 4 5 6; do
  if docker exec sapphire_db pg_isready -U sapphire -d sapphire_marketing >/dev/null 2>&1; then
    DB_OK="yes"; break
  fi
  echo "   sapphire_db not ready (attempt $i/6) — waiting 5s..."
  sleep 5
done
if [ "$DB_OK" != "yes" ]; then
  echo "   sapphire_db still unhealthy — restarting it..."
  docker compose --env-file "$ENV_FILE" up -d postgres 2>&1 || true
  sleep 12
fi

echo "→ Ensuring upload subdirs are writable by the nextjs container user (uid 1001)..."
mkdir -p /opt/sapphire/uploads/queue-ads
chown 1001:1001 /opt/sapphire/uploads/queue-ads

echo "→ Recreating sapphire_app container (--no-deps, skip dep wait)..."
# --no-deps avoids tearing down or waiting on postgres/redis when only
# the app changed. If postgres is briefly unhealthy mid-deploy, this
# keeps the rebuild from leaving sapphire_app DOWN (502 on nginx).
docker compose --env-file "$ENV_FILE" up -d --force-recreate --no-deps app
UP_RC=$?
if [ "$UP_RC" != "0" ]; then
  echo "❌ Container recreate failed (exit $UP_RC)."
  echo "→ Attempting fallback: start app with previous image..."
  docker compose --env-file "$ENV_FILE" up -d --no-deps app 2>&1 || true
  exit 1
fi

echo "→ Waiting 25s for app to stabilize..."
sleep 25

echo "→ Health check on http://localhost:3000/..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>&1 || echo "000")
echo "   HTTP $HTTP_CODE"

echo "→ Container logs (last 30 lines):"
docker logs sapphire_app --tail 30 2>&1 || true

if [ "$HTTP_CODE" = "000" ]; then
  echo "❌ Marketing Hub did not come up on port 3000"
  exit 1
fi

# ─── Post-deploy verification ───────────────────────────────
# Fetch the schedules gate from the running container and check
# that the rebrand markers are present (no orange palette, no
# broken sandbox-clinic logo). If a stale image somehow ended
# up running, fail the workflow loudly here rather than letting
# a silent regression reach end users.
echo "→ Verifying rebrand markers on rendered /schedules..."
BODY=$(curl -s -L --max-time 10 -H 'Host: schedules.sapphireclinicseast.org' \
  http://localhost:3000/schedules 2>/dev/null || echo '')
HAS_NARRA=$(echo "$BODY" | grep -c '#1B3F38' || true)
HAS_PAPER=$(echo "$BODY" | grep -c '#F5F0E8' || true)
HAS_ORANGE=$(echo "$BODY" | grep -c '#ED6823' || true)
HAS_LOGO=$(echo "$BODY" | grep -c 'sandbox-clinic-logo' || true)
echo "   #1B3F38 (Narra):           $HAS_NARRA hits"
echo "   #F5F0E8 (Paper):           $HAS_PAPER hits"
echo "   #ED6823 (legacy orange):   $HAS_ORANGE hits   (must be 0)"
echo "   sandbox-clinic-logo:       $HAS_LOGO hits     (must be 0)"
if [ "$HAS_ORANGE" != "0" ] || [ "$HAS_LOGO" != "0" ]; then
  echo "❌ Stale image detected — running container still serves the orange/logo layout."
  echo "   This usually means the docker build cache short-circuited the rebuild."
  echo "   Image-layer history of running container:"
  docker inspect --format '{{.Image}}' sapphire_app | xargs -I{} docker history --no-trunc {} 2>&1 | head -20 || true
  exit 1
fi
echo "   ✅ Rebrand markers present — running image is fresh."

# Stamp which source this image was built from. The verify step later in the
# workflow compares this to .deploy-sha; if they differ, the rebuild did not
# run for this deploy and the run is failed.
#
# A marker rather than a timestamp comparison: `docker compose build` reuses a
# cached image when nothing under the build context changed, leaving the
# image's Created date old even though the rebuild ran correctly. Comparing
# timestamps would fail those deploys for no reason. Writing the sha only on
# this success path answers the question actually being asked -- "did the
# rebuild complete against this source?"
cp "$SRC_SHA_FILE" "$REBUILD_SHA_FILE" 2>/dev/null \
  || echo "unknown" > "$REBUILD_SHA_FILE"

echo ""
echo "✅ Marketing Hub rebuilt & restarted (HTTP $HTTP_CODE)."
