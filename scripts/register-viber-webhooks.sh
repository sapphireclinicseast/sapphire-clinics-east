#!/bin/bash
# ============================================================
# Register Viber Bot webhooks for SBEA and SBGH clinic bots.
# Run this ONCE after creating the bots at:
#   https://partners.viber.com
#
# Prerequisites:
#   VIBER_BOT_TOKEN_SBEA  — bot auth token from partners.viber.com
#   VIBER_BOT_TOKEN_SBGH  — bot auth token from partners.viber.com
#
# Usage (from Mac, after setting env vars):
#   VIBER_BOT_TOKEN_SBEA="xxxx" VIBER_BOT_TOKEN_SBGH="yyyy" \
#     bash scripts/register-viber-webhooks.sh
# ============================================================

BASE_URL="https://marketing.sapphireclinicseast.org"

if [ -z "$VIBER_BOT_TOKEN_SBEA" ] || [ -z "$VIBER_BOT_TOKEN_SBGH" ]; then
  echo ""
  echo "❌  Missing Viber bot tokens."
  echo "    Set VIBER_BOT_TOKEN_SBEA and VIBER_BOT_TOKEN_SBGH before running."
  echo ""
  exit 1
fi

register() {
  local BRANCH="$1"
  local TOKEN="$2"
  local WEBHOOK_URL="${BASE_URL}/api/viber/webhook?branch=${BRANCH}"

  echo "→ Registering webhook for ${BRANCH}..."
  echo "  URL: ${WEBHOOK_URL}"

  RESPONSE=$(curl -s -X POST https://chatapi.viber.com/pa/set_webhook \
    -H "X-Viber-Auth-Token: ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
      \"url\": \"${WEBHOOK_URL}\",
      \"event_types\": [\"subscribed\",\"message\",\"unsubscribed\"],
      \"send_name\": true,
      \"send_photo\": true
    }")

  STATUS=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',999))" 2>/dev/null)
  MSG=$(echo "$RESPONSE"    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status_message','?'))" 2>/dev/null)

  if [ "$STATUS" = "0" ]; then
    echo "  ✅  ${BRANCH} webhook registered OK"
  else
    echo "  ❌  ${BRANCH} failed (status=$STATUS: $MSG)"
    echo "      Raw response: $RESPONSE"
  fi
  echo ""
}

echo ""
echo "═══════════════════════════════════════════════"
echo "  Registering Viber Webhooks"
echo "═══════════════════════════════════════════════"
echo ""

register "SBEA" "$VIBER_BOT_TOKEN_SBEA"
register "SBGH" "$VIBER_BOT_TOKEN_SBGH"

echo "═══════════════════════════════════════════════"
echo "  Done! Patients can now subscribe by messaging"
echo "  your bots on Viber."
echo "═══════════════════════════════════════════════"
echo ""
