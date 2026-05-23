#!/bin/bash
# scei-docker-prune-weekly.sh — run weekly via cron (Sunday 04:00 local).
# Keeps Docker disk usage bounded so we don't repeat the May 2 / May 23
# disk-fill incidents. Two failure modes that filled the disk both times:
#   1) `docker compose build` accumulates BuildKit cache forever (each
#      manual rebuild adds ~5 GB; after 5 rebuilds the cache passes 25 GB).
#   2) Old image layers from rolled-back deploys sit indefinitely.
#
# What this prunes (via --filter "until=168h"):
#   - BuildKit cache layers older than 7 days
#   - Stopped containers
#   - Unused networks
#   - Dangling images
# What it KEEPS:
#   - Anything used by a currently-running container
#   - Cache hit by builds in the last 7 days
#   - Named volumes (we manually --volumes only when desperate)

set -uo pipefail

LOG=/var/log/docker-prune.log
ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log() { echo "[$(ts)] $*" >> "$LOG"; }

log "=== weekly prune start ==="
log "before: $(df -h / | tail -1)"
log "before: $(docker system df --format 'table {{.Type}}\t{{.Total}}\t{{.Size}}\t{{.Reclaimable}}' 2>&1 | tr '\n' '|')"

# Conservative prune — only artifacts older than 7 days
OUTPUT=$(docker system prune -af --filter "until=168h" 2>&1)
log "$OUTPUT"

log "after:  $(df -h / | tail -1)"
log "after:  $(docker system df --format 'table {{.Type}}\t{{.Total}}\t{{.Size}}\t{{.Reclaimable}}' 2>&1 | tr '\n' '|')"
log "=== weekly prune done ==="

# If disk is STILL above 90% after prune, escalate via the disk-alert
# script (which has its own dedup logic).
USAGE=$(df / | awk 'NR==2 {print $5+0}')
if [ "$USAGE" -ge 90 ] && [ -x /usr/local/bin/disk-alert.sh ]; then
  log "disk still at ${USAGE}% after prune — invoking disk-alert.sh"
  /usr/local/bin/disk-alert.sh
fi
