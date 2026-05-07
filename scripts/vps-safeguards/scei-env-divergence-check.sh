#!/bin/bash
# scei-env-divergence-check.sh — runs hourly via cron.
# Detects drift between the canonical .env.production used by the deploy
# (/opt/sapphire/docker/.env.production) and any other .env.production
# that's been edited on the side. Today's "Registration Form empty" bug
# was caused by exactly this: someone edited /opt/sapphire-marketing-hub/
# docker/.env.production to set HR_PLATFORM_URL=host.docker.internal,
# but the deploy used /opt/sapphire/docker/.env.production where it was
# still 127.0.0.1.

set -uo pipefail

CANONICAL=/opt/sapphire/docker/.env.production
LOG=/var/log/scei-env-divergence.log
ALERT=/usr/local/bin/scei-alert.sh

# Other .env.production files we may compare against (best-effort list)
SHADOWS=(
  /opt/sapphire-marketing-hub/docker/.env.production
  /var/www/sapphireclinicseast.org/docker/.env.production
)

# Critical keys — drift here means the wrong service-to-service URL,
# DB credentials, or auth secrets, all of which silently break in prod.
CRITICAL_KEYS=(
  HR_PLATFORM_URL
  HR_PLATFORM_API_KEY
  DATABASE_URL
  REDIS_URL
  NEXTAUTH_URL
  NEXTAUTH_SECRET
  EXTERNAL_API_KEY
  RESEND_API_KEY
)

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log() { echo "[$(ts)] $*" >> "$LOG"; }

if [ ! -f "$CANONICAL" ]; then
  log "ABORT — canonical $CANONICAL not found"
  exit 0
fi

drift_lines=""
for shadow in "${SHADOWS[@]}"; do
  [ -f "$shadow" ] || continue
  [ "$shadow" = "$CANONICAL" ] && continue

  for key in "${CRITICAL_KEYS[@]}"; do
    cv=$(grep -E "^$key=" "$CANONICAL" | head -1 | cut -d= -f2-)
    sv=$(grep -E "^$key=" "$shadow" | head -1 | cut -d= -f2-)
    if [ -n "$cv" ] && [ -n "$sv" ] && [ "$cv" != "$sv" ]; then
      drift_lines="${drift_lines}  $key:\n    canonical ($CANONICAL) = $cv\n    shadow    ($shadow) = $sv\n"
    fi
  done
done

if [ -z "$drift_lines" ]; then
  exit 0  # quiet on success
fi

log "DRIFT DETECTED:"
printf "%b" "$drift_lines" >> "$LOG"

# Alert (idempotent — same alert can fire multiple times if drift persists)
[ -x "$ALERT" ] && "$ALERT" "[SCEI] env-file drift" "$(printf "Critical-key divergence between canonical and shadow .env.production files:\n\n%b\nLast 20 log lines:\n%s" "$drift_lines" "$(tail -20 $LOG)")" 2>/dev/null || true
