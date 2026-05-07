#!/bin/bash
# scei-hr-connectivity-check.sh — runs every 5 min via cron.
# Verifies the marketing-hub container can actually reach HR Platform with
# the configured HR_PLATFORM_URL + HR_PLATFORM_API_KEY. Alerts after 3
# consecutive failures (15 minutes) so transient blips don't page anyone,
# but a sustained outage gets caught long before staff notice.
#
# What it catches that a simple `curl localhost:3457` would miss:
#   • Container env-var misconfigurations (host.docker.internal vs 127.0.0.1)
#   • Missing extra_hosts entry in docker-compose.yml
#   • Bearer-token mismatch between the two services
#   • DNS / network-namespace issues only visible from inside the container

set -uo pipefail

LOG=/var/log/scei-hr-connectivity.log
STATE=/var/run/scei-hr-connectivity.state    # consecutive-failure counter
ALERT_THRESHOLD=3
SENTINEL_FORM_ID=GULaVBpI                    # stable form ID with non-zero responses

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log() { echo "[$(ts)] $*" >> "$LOG"; }

# Fast-fail if the container itself isn't running
if ! docker inspect sapphire_app --format '{{.State.Running}}' 2>/dev/null | grep -q true; then
  log "ABORT — sapphire_app container is not running"
  exit 0
fi

# Run the check from INSIDE the container so we exercise the same network
# path as the actual application.
result=$(docker exec sapphire_app node -e '
async function go() {
  const url = process.env.HR_PLATFORM_URL + "/forms/external/'"$SENTINEL_FORM_ID"'/responses";
  const key = process.env.HR_PLATFORM_API_KEY;
  if (!process.env.HR_PLATFORM_URL || !key) {
    console.log("FAIL: env vars missing — HR_PLATFORM_URL=" + process.env.HR_PLATFORM_URL + " key_set=" + !!key);
    process.exit(1);
  }
  try {
    const r = await fetch(url, {
      headers: { Authorization: "Bearer " + key },
      signal: AbortSignal.timeout(8000),
    });
    const d = await r.json();
    if (d.ok) console.log("OK ok=" + d.ok + " items=" + (d.items||[]).length);
    else      { console.log("FAIL: HR returned ok=" + d.ok + " err=" + d.error); process.exit(1); }
  } catch (e) {
    console.log("FAIL: " + e.message);
    process.exit(1);
  }
}
go();
' 2>&1)

if echo "$result" | grep -q '^OK'; then
  prev=$(cat "$STATE" 2>/dev/null || echo 0)
  if [ "$prev" -gt 0 ]; then
    log "RECOVERED (was failing $prev consecutive times) — $result"
    /usr/local/bin/scei-alert.sh "[SCEI] HR connectivity recovered" "Was failing $prev consecutive runs; now: $result" 2>/dev/null || true
  fi
  echo 0 > "$STATE"
  exit 0
fi

# Failure path
prev=$(cat "$STATE" 2>/dev/null || echo 0)
new=$((prev + 1))
echo "$new" > "$STATE"
log "FAIL #$new — $result"

if [ "$new" -eq "$ALERT_THRESHOLD" ]; then
  /usr/local/bin/scei-alert.sh "[SCEI] HR connectivity DOWN — $new consecutive failures" \
    "$(tail -10 $LOG)" 2>/dev/null || true
  log "ALERT sent at threshold $ALERT_THRESHOLD"
fi
