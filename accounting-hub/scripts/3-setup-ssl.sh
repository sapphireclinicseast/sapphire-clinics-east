#!/bin/bash
# ============================================================
# SAPPHIRE Accounting Hub — Step 3: Set Up HTTPS / SSL
# ============================================================
# Run this on the VPS AFTER the app is running on HTTP
# AND after your DNS A record is pointing to this server.
# ============================================================

set -e

DOMAIN="accounting.sapphireclinicseast.org"
EMAIL="sandboxcliniceast@gmail.com"

echo ""
echo "  SAPPHIRE Accounting Hub — Setting Up SSL / HTTPS"
echo ""

# ── Check DNS is resolving
echo "  Checking DNS for $DOMAIN..."
SERVER_IP=$(curl -s ifconfig.me)
DNS_IP=$(dig +short "$DOMAIN" 2>/dev/null | tail -1)

if [ -z "$DNS_IP" ]; then
  echo "  Warning: Could not resolve $DOMAIN."
  echo "  Make sure you've added an A record in your domain settings."
  echo "  Continuing anyway..."
  echo ""
else
  echo "  Server IP: $SERVER_IP"
  echo "  DNS resolves to: $DNS_IP"
  if [ "$SERVER_IP" != "$DNS_IP" ]; then
    echo ""
    echo "  Warning: DNS ($DNS_IP) doesn't match this server ($SERVER_IP)."
    read -p "  Continue anyway? (y/n): " CONTINUE
    [ "$CONTINUE" != "y" ] && exit 1
  else
    echo "  DNS is correctly pointing to this server."
  fi
fi

# ── Get SSL certificate via certbot (standalone mode)
echo ""
echo "  Requesting SSL certificate from Let's Encrypt..."

# Stop nginx temporarily so certbot can use port 80
systemctl stop nginx 2>/dev/null || true

certbot certonly \
  --standalone \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN"

echo "  SSL certificate obtained!"

# ── Add nginx server block
echo ""
echo "  Configuring nginx for $DOMAIN..."

cat > /etc/nginx/sites-available/accounting << 'NGINXEOF'
# ── accounting.sapphireclinicseast.org ─────────────────────
server {
    listen 80;
    server_name accounting.sapphireclinicseast.org;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name accounting.sapphireclinicseast.org;

    ssl_certificate /etc/letsencrypt/live/accounting.sapphireclinicseast.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/accounting.sapphireclinicseast.org/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    client_max_body_size 10M;

    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";

    location / {
        proxy_pass http://127.0.0.1:3001;
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
NGINXEOF

# Enable the site
ln -sf /etc/nginx/sites-available/accounting /etc/nginx/sites-enabled/accounting

# Test and reload nginx
nginx -t && systemctl start nginx && systemctl reload nginx

echo ""
echo "  HTTPS is now active!"
echo ""
echo "  Your Accounting Hub is live at:"
echo "  https://accounting.sapphireclinicseast.org"
echo ""
echo "  Default login:"
echo "  Email:    admin@sapphireclinicseast.org"
echo "  Password: SCEIAccounting2026!"
echo ""
echo "  SSL auto-renews via certbot."
echo ""
