#!/usr/bin/env bash
# Nightly staff sync — pull the HR roster into the Operations Hub.
#
# Installed at /usr/local/bin/scei-staff-sync.sh and run from root's crontab:
#   15 1 * * * /usr/local/bin/scei-staff-sync.sh || /usr/local/bin/scei-alert.sh \
#     "[SCEI] staff sync FAILED" "$(tail -5 /var/log/scei-staff-sync.log)"
#
# Kept in the repo as well as on the VPS so it is not a file that exists in one
# place only — several of this system's scheduled jobs were, and a rebuild lost
# them silently.
#
# Why nightly at all: the sync had one trigger, a button in the Staff module.
# Nobody presses a button they have no reason to think about, so the roster
# drifted from HR until something went visibly wrong — a therapist deactivated
# in HR was still on the Decking board nine days later.
#
# Idempotent: everyone in the HR feed is upserted, everyone absent from it is
# deactivated. Running twice changes nothing the first run did not.
set -uo pipefail
LOG=/var/log/scei-staff-sync.log
SECRET=$(docker exec sapphire_app printenv CRON_SECRET 2>/dev/null)
if [ -z "$SECRET" ]; then
  echo "$(date -Is) CRON_SECRET unavailable from sapphire_app" >> "$LOG"
  exit 1
fi
RESP=$(curl -sS -m 120 -X POST -H "x-cron-secret: $SECRET" \
  https://operations.sapphireclinicseast.org/api/staff/sync/cron 2>&1)
echo "$(date -Is) $RESP" >> "$LOG"
case "$RESP" in
  *'"ok":true'*) exit 0 ;;
  *) exit 1 ;;
esac
