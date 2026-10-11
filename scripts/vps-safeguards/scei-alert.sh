#!/usr/bin/env bash
# scei-alert.sh "SUBJECT" "BODY" — send an ops alert email from the VPS.
#
# Installed at /usr/local/bin/scei-alert.sh; called by the safeguard crons
# (disk-alert.sh et al). Sends through the ops hub's authenticated email
# relay (POST /api/email/external, Gmail API behind it) — this replaced the
# direct Resend API call when the Resend subscription was retired (Oct 2026).
#
# Auth: reuses the shared EXTERNAL_API_KEY already present in the sapphire
# stack's .env — no new secret on the host.
set -u

SUBJ="${1:-}"
BODY="${2:-}"
TO="${SCEI_ALERT_TO:-main@sapphireclinicseast.org}"
RELAY="${SCEI_ALERT_RELAY:-https://operations.sapphireclinicseast.org/api/email/external}"
ENV_FILE="/opt/sapphire/docker/.env"

if [ -z "$SUBJ" ] || [ -z "$BODY" ]; then
  echo "usage: scei-alert.sh SUBJECT BODY" >&2
  exit 2
fi

API_KEY="$(grep -m1 '^EXTERNAL_API_KEY=' "$ENV_FILE" 2>/dev/null | cut -d= -f2-)"
if [ -z "$API_KEY" ]; then
  echo "scei-alert: EXTERNAL_API_KEY not found in $ENV_FILE" >&2
  exit 3
fi

# jq-free JSON encoding (the body is df/log output — quotes and newlines happen).
json_escape() { python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'; }
PAYLOAD=$(printf '{"to":%s,"subject":%s,"text":%s}' \
  "$(printf '%s' "$TO" | json_escape)" \
  "$(printf '%s' "$SUBJ" | json_escape)" \
  "$(printf '%s' "$BODY" | json_escape)")

HTTP_CODE=$(curl -sS -o /tmp/scei-alert-last.json -w '%{http_code}' \
  -X POST "$RELAY" \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  --max-time 30 \
  -d "$PAYLOAD") || { echo "scei-alert: curl failed" >&2; exit 4; }

if [ "$HTTP_CODE" != "200" ]; then
  echo "scei-alert: relay returned HTTP $HTTP_CODE: $(cat /tmp/scei-alert-last.json 2>/dev/null)" >&2
  exit 5
fi
exit 0
