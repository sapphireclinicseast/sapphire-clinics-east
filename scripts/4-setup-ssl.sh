#!/bin/bash
# ============================================================
# SAPPHIRE Marketing Hub — Step 4: Set Up HTTPS / SSL
# ============================================================
# Run this on the VPS AFTER the app is running on HTTP
# AND after your DNS A record is pointing to this server.
#
# Before running, verify DNS is working by visiting:
#   http://marketing.sapphireclinicseast.org
# If the login page loads → DNS is ready → run this script.
# ============================================================

set -e

DOMAIN="marketing.sapphireclinicseast.org"
EMAIL="sandboxcliniceast@gmail.com"
APP_DIR="/opt/sapphire"
DOCKER_DIR="$APP_DIR/docker"
ENV_FILE="$DOCKER_DIR/.env.production"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  SAPPHIRE Marketing Hub — Setting Up SSL / HTTPS"
echo "═══════════════════════════════════════════════════════"
echo ""

# ── Check DNS is resolving ───────────────────────────────────
echo "→ Checking DNS for $DOMAIN..."
SERVER_IP=$(curl -s ifconfig.me)
DNS_IP=$(dig +short "$DOMAIN" 2>/dev/null | tail -1)

if [ -z "$DNS_IP" ]; then
  echo "⚠  Warning: Could not resolve $DOMAIN."
  echo "   Make sure you've added an A record in your domain settings."
  echo "   Continuing anyway (Let's Encrypt will fail if DNS isn't ready)..."
  echo ""
else
  echo "   Server IP: $SERVER_IP"
  echo "   DNS resolves to: $DNS_IP"
  if [ "$SERVER_IP" != "$DNS_IP" ]; then
    echo ""
    echo "⚠  Warning: DNS ($DNS_IP) doesn't match this server ($SERVER_IP)."
    echo "   Let's Encrypt may fail. Make sure your A record points to $SERVER_IP"
    echo ""
    read -p "   Continue anyway? (y/n): " CONTINUE
    [ "$CONTINUE" != "y" ] && exit 1
  else
    echo "   ✅  DNS is correctly pointing to this server."
  fi
fi

# ── Get SSL certificate via certbot ──────────────────────────
echo ""
echo "→ Requesting SSL certificate from Let's Encrypt..."
cd "$DOCKER_DIR"

docker compose --env-file "$ENV_FILE" run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN"

echo "✅  SSL certificate obtained!"

# ── Switch nginx to HTTPS config ─────────────────────────────
echo ""
echo "→ Switching nginx to HTTPS mode..."

# Restore the full SSL nginx config
cp "$DOCKER_DIR/nginx.conf.bak.ssl" "$DOCKER_DIR/nginx.conf" 2>/dev/null || true

# If backup doesn't exist, the original nginx.conf (with SSL) is already there
# Ensure nginx.conf has SSL config
if ! grep -q "ssl_certificate" "$DOCKER_DIR/nginx.conf"; then
  cat > "$DOCKER_DIR/nginx.conf" << 'NGINXCONF'
server {
    listen 80;
    server_name marketing.sapphireclinicseast.org;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name marketing.sapphireclinicseast.org;

    ssl_certificate /etc/letsencrypt/live/marketing.sapphireclinicseast.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/marketing.sapphireclinicseast.org/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    client_max_body_size 50M;

    location / {
        proxy_pass http://app:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINXCONF
fi

# Reload nginx with new config
docker compose --env-file "$ENV_FILE" exec nginx nginx -s reload

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  🎉  HTTPS is now active!"
echo ""
echo "  Your Marketing Hub is live at:"
echo "  https://marketing.sapphireclinicseast.org"
echo ""
echo "  ✅  SSL auto-renews every 60 days (certbot handles this)"
echo ""
echo "  FINAL STEPS:"
echo "  1. Visit https://marketing.sapphireclinicseast.org"
echo "  2. Log in and change the default password"
echo "  3. Go to Settings → Connected Accounts"
echo "     → Reconnect Facebook/Instagram accounts"
echo "  4. In Google Cloud Console → update redirect URI to:"
echo "     https://marketing.sapphireclinicseast.org/api/auth/callback/google"
echo "═══════════════════════════════════════════════════════"
echo ""
