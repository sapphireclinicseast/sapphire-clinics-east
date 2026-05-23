#!/bin/bash
# disk-alert.sh — emit warnings when root partition crosses usage thresholds.
#
# Three-tier escalation:
#   WARN  (>= 90%) — log + alert once when state enters, then suppress for 6 h
#   HIGH  (>= 95%) — log + alert once when state enters, then suppress for 1 h
#   CRIT  (>= 98%) — log + alert every run (postgres will start crashing very soon)
#
# Without the suppression window, the cron firing every 5 min would have sent
# the user 12 identical alerts/hour during the May 23 incident — which is
# exactly why we ignored the local-mail alerts in the first place.
#
# State file tracks "level we last alerted at" + "timestamp of that alert".
# Designed to be safe to lose (re-alerts after reboot, no false positives).

set -uo pipefail

LOG=/var/log/disk-alert.log
STATE=/var/run/disk-alert.state
ALERT=/usr/local/bin/scei-alert.sh

WARN_PCT=90
HIGH_PCT=95
CRIT_PCT=98

WARN_SUPPRESS_SEC=$((6 * 3600))   # 6 hours
HIGH_SUPPRESS_SEC=$((1 * 3600))   # 1 hour
# CRIT has no suppression — every 5 min until cleared.

ts()  { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log() { echo "[$(ts)] $*" >> "$LOG"; }

USAGE=$(df / | awk 'NR==2 {print $5+0}')
DF_LINE=$(df -h / | tail -1)
HOST=$(hostname)

# Read previous state (level + epoch timestamp)
if [ -f "$STATE" ]; then
  PREV_LEVEL=$(awk 'NR==1' "$STATE" 2>/dev/null || echo "OK")
  PREV_TS=$(awk 'NR==2' "$STATE" 2>/dev/null || echo "0")
else
  PREV_LEVEL=OK
  PREV_TS=0
fi
NOW=$(date +%s)

# Decide current level
if   [ "$USAGE" -ge "$CRIT_PCT" ]; then CUR=CRIT
elif [ "$USAGE" -ge "$HIGH_PCT" ]; then CUR=HIGH
elif [ "$USAGE" -ge "$WARN_PCT" ]; then CUR=WARN
else                                    CUR=OK
fi

# Recovery — clear state when we drop back below warn
if [ "$CUR" = "OK" ] && [ "$PREV_LEVEL" != "OK" ]; then
  msg="DISK RECOVERED — back to ${USAGE}% on ${HOST} (was ${PREV_LEVEL})"
  log "$msg"
  [ -x "$ALERT" ] && "$ALERT" "[SCEI] disk recovered (${USAGE}%)" "$msg
$DF_LINE" 2>/dev/null || true
  echo -e "OK\n$NOW" > "$STATE"
  exit 0
fi

[ "$CUR" = "OK" ] && exit 0

# Should we alert? (Always for CRIT; suppression-windowed for WARN/HIGH)
SHOULD_ALERT=0
case "$CUR" in
  CRIT) SHOULD_ALERT=1 ;;
  HIGH)
    if [ "$PREV_LEVEL" != "HIGH" ] && [ "$PREV_LEVEL" != "CRIT" ]; then
      SHOULD_ALERT=1
    elif [ "$((NOW - PREV_TS))" -ge "$HIGH_SUPPRESS_SEC" ]; then
      SHOULD_ALERT=1
    fi
    ;;
  WARN)
    if [ "$PREV_LEVEL" != "WARN" ] && [ "$PREV_LEVEL" != "HIGH" ] && [ "$PREV_LEVEL" != "CRIT" ]; then
      SHOULD_ALERT=1
    elif [ "$((NOW - PREV_TS))" -ge "$WARN_SUPPRESS_SEC" ]; then
      SHOULD_ALERT=1
    fi
    ;;
esac

# Always log the observation (cheap, useful for audit)
log "${CUR} ${USAGE}% on ${HOST} | ${DF_LINE}"

if [ "$SHOULD_ALERT" -eq 1 ]; then
  SUBJ="[SCEI] disk ${CUR} — ${USAGE}% on ${HOST}"
  BODY="$DF_LINE

Level: $CUR (threshold WARN=${WARN_PCT}%, HIGH=${HIGH_PCT}%, CRIT=${CRIT_PCT}%)
Previous level: $PREV_LEVEL
Suppression: WARN=${WARN_SUPPRESS_SEC}s, HIGH=${HIGH_SUPPRESS_SEC}s, CRIT=none

Top consumers of /opt/:
$(du -sh /opt/* 2>/dev/null | sort -rh | head -8 | sed 's/^/  /')

Docker reclaimable:
$(docker system df 2>/dev/null | grep -E 'TYPE|Build Cache|Images' | sed 's/^/  /')

To free space immediately:
  docker system prune -af --filter 'until=168h'   # keep last 7 days only
  docker system prune -af                          # nuclear: everything"
  if [ -x "$ALERT" ]; then
    "$ALERT" "$SUBJ" "$BODY" >> "$LOG" 2>&1 || log "scei-alert returned non-zero (Resend may be down — see $LOG above)"
  else
    log "ALERT SCRIPT NOT FOUND at $ALERT — cannot deliver"
  fi
  echo -e "$CUR\n$NOW" > "$STATE"
fi
