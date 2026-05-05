#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════
#  Deploy SCEI ERP Hub → erp.sapphireclinicseast.org
#  VPS: 152.53.231.249
#
#  FIRST-TIME SETUP (run once on the VPS):
#    1. Ensure DNS A record erp.sapphireclinicseast.org → 152.53.231.249 ✅ (already set)
#    2. Install nginx site config:
#         sudo cp /var/www/sapphireclinicseast.org/scripts/nginx.conf \
#                 /etc/nginx/sites-available/sapphireclinicseast.org
#         sudo nginx -t && sudo systemctl reload nginx
#    3. Issue Let's Encrypt cert:
#         sudo certbot --nginx -d erp.sapphireclinicseast.org
#    4. Create web root:
#         sudo mkdir -p /var/www/erp.sapphireclinicseast.org
#         sudo chown -R www-data:www-data /var/www/erp.sapphireclinicseast.org
#
#  ROUTINE DEPLOY — run this script from your local machine:
#    bash erp-hub/deploy.sh
# ══════════════════════════════════════════════════════════════════

set -euo pipefail

VPS_USER="${VPS_USER:-root}"
VPS_HOST="${VPS_HOST:-152.53.231.249}"
REMOTE_DIR="/var/www/erp.sapphireclinicseast.org"
LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "→ Deploying ERP Hub to ${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}"

rsync -avz --delete \
  --exclude 'deploy.sh' \
  --exclude '.DS_Store' \
  "${LOCAL_DIR}/" \
  "${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}/"

echo "→ Reloading nginx"
ssh "${VPS_USER}@${VPS_HOST}" "nginx -t && systemctl reload nginx"

echo "✓ Live at https://erp.sapphireclinicseast.org"
