#!/bin/bash
# ══════════════════════════════════════════════════════════════════
#  SAPPHIRE CLINICS EAST — Netcup VPS Setup Script
#  Run this ONCE on a fresh Ubuntu/Debian VPS as root.
#
#  USAGE:
#    ssh root@YOUR_VPS_IP
#    bash <(curl -sL https://raw.githubusercontent.com/sapphireclinicseast/sapphire-clinics-east/main/scripts/setup-vps.sh)
#
#  Or copy this file to the VPS and run:  chmod +x setup-vps.sh && ./setup-vps.sh
# ══════════════════════════════════════════════════════════════════
set -e

DOMAIN="sapphireclinicseast.org"
WEBROOT="/var/www/${DOMAIN}"
NGINX_CONF="/etc/nginx/sites-available/${DOMAIN}"
NODE_VERSION="20"

echo ""
echo "══════════════════════════════════════════════"
echo "  SCEI VPS Setup — ${DOMAIN}"
echo "══════════════════════════════════════════════"
echo ""

# ── Step 1: System update ────────────────────────────────────────
echo "▶ Step 1/8: Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq
apt-get install -y -qq curl wget gnupg2 ufw rsync

# ── Step 2: Install Nginx ────────────────────────────────────────
echo "▶ Step 2/8: Installing Nginx..."
apt-get install -y -qq nginx
systemctl enable nginx

# ── Step 3: Install Node.js ──────────────────────────────────────
echo "▶ Step 3/8: Installing Node.js ${NODE_VERSION}..."
curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
apt-get install -y -qq nodejs
echo "   Node: $(node -v)  |  npm: $(npm -v)"

# ── Step 4: Install PM2 (keeps OAuth proxy running) ─────────────
echo "▶ Step 4/8: Installing PM2..."
npm install -g pm2 -q
pm2 startup systemd -u root --hp /root | tail -1 | bash

# ── Step 5: Install Certbot (SSL) ───────────────────────────────
echo "▶ Step 5/8: Installing Certbot..."
apt-get install -y -qq certbot python3-certbot-nginx

# ── Step 6: Create web directory ────────────────────────────────
echo "▶ Step 6/8: Creating web directory at ${WEBROOT}..."
mkdir -p "${WEBROOT}"
chown -R www-data:www-data "${WEBROOT}"
chmod -R 755 "${WEBROOT}"

# Create a temporary placeholder so Nginx can start
cat > "${WEBROOT}/index.html" <<'EOF'
<!DOCTYPE html><html><body>
<p>Sapphire Clinics East — deploying, please wait...</p>
</body></html>
EOF

# ── Step 7: Configure firewall ──────────────────────────────────
echo "▶ Step 7/8: Configuring firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# ── Step 8: Add deploy SSH key ──────────────────────────────────
echo "▶ Step 8/8: Setting up deploy SSH key..."
echo ""
echo "══════════════════════════════════════════════════════════"
echo "  ACTION NEEDED — Generate a deploy SSH key"
echo "══════════════════════════════════════════════════════════"
echo ""
echo "  Run this on your LOCAL machine (Mac Terminal), NOT the VPS:"
echo ""
echo "    ssh-keygen -t ed25519 -C 'scei-deploy' -f ~/.ssh/scei_deploy"
echo "    cat ~/.ssh/scei_deploy.pub"
echo ""
echo "  Then paste the PUBLIC key content below and press Enter:"
echo "  (or press Ctrl+C to skip and do this manually later)"
echo ""
read -r -p "  Paste public key here: " PUBKEY
if [ -n "${PUBKEY}" ]; then
    mkdir -p /root/.ssh
    echo "${PUBKEY}" >> /root/.ssh/authorized_keys
    chmod 600 /root/.ssh/authorized_keys
    echo "  ✓ Public key added to /root/.ssh/authorized_keys"
fi

# ── Set up basic Nginx block (HTTP only, HTTPS added by Certbot) ─
echo ""
echo "▶ Setting up initial Nginx config..."
cat > "${NGINX_CONF}" <<NGINX_EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};
    root ${WEBROOT};
    index index.html;
    location / { try_files \$uri \$uri/ /index.html; }
}
NGINX_EOF

ln -sf "${NGINX_CONF}" /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  ✅  Base setup complete!"
echo "══════════════════════════════════════════════════════════"
echo ""
echo "  NEXT STEPS (in order):"
echo ""
echo "  1. On GitHub (github.com/sapphireclinicseast/sapphire-clinics-east):"
echo "     Settings → Secrets → Actions → New secret:"
echo "       VPS_HOST  = $(curl -s ifconfig.me)"
echo "       VPS_USER  = root"
echo "       VPS_SSH_KEY = <content of ~/.ssh/scei_deploy (the PRIVATE key)>"
echo ""
echo "  2. Push any commit to GitHub to trigger the first auto-deploy."
echo "     The site files will sync here automatically."
echo ""
echo "  3. Update your DNS (in Squarespace) AFTER the first deploy:"
echo "       Delete the Netlify A records"
echo "       Add: A  @  $(curl -s ifconfig.me)"
echo "       Keep:   CNAME  www  → ${DOMAIN}"
echo ""
echo "  4. Once DNS has propagated, run Certbot for HTTPS:"
echo "     certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}"
echo ""
echo "  5. After Certbot succeeds, install the full Nginx config:"
echo "     cp ${WEBROOT}/scripts/nginx.conf ${NGINX_CONF}"
echo "     nginx -t && systemctl reload nginx"
echo ""
echo "  6. Start the CMS OAuth proxy:"
echo "     (First complete the GitHub OAuth App setup — see scripts/oauth-proxy.js for instructions)"
echo "     GITHUB_CLIENT_ID=xxx GITHUB_CLIENT_SECRET=yyy pm2 start ${WEBROOT}/scripts/oauth-proxy.js --name scei-oauth"
echo "     pm2 save"
echo ""
