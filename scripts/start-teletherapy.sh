#!/bin/bash
# ============================================================
# SAPPHIRE Teletherapy — Deploy & Start
# ============================================================
# Run this on the VPS to build and start the teletherapy app.
# Requires the marketing hub to be running first (shared DB).
# ============================================================

set -e

TELETHERAPY_DIR="/var/www/sapphireclinicseast.org/teletherapy"
ENV_FILE="/opt/sapphire/docker/.env.production"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  SCEI Teletherapy — Deploying"
echo "═══════════════════════════════════════════════════════"
echo ""

# ── Check the teletherapy directory exists ───────────────────
if [ ! -d "$TELETHERAPY_DIR" ]; then
  echo "❌  Teletherapy directory not found at $TELETHERAPY_DIR"
  exit 1
fi

cd "$TELETHERAPY_DIR"

# ── Install dependencies ────────────────────────────────────
echo "→ Installing dependencies..."
npm ci --production=false

# ── Generate Prisma client ───────────────────────────────────
echo "→ Generating Prisma client..."
npx prisma generate

# ── Push new tables to shared database ───────────────────────
echo "→ Pushing teletherapy tables to database..."
npx prisma db push --accept-data-loss 2>/dev/null || echo "⚠  Tables may already exist, continuing."

# ── Build the app ────────────────────────────────────────────
echo "→ Building Next.js app..."
npm run build

# ── Seed admin account ───────────────────────────────────────
echo "→ Seeding admin account..."
npm run db:seed 2>/dev/null || echo "⚠  Admin account may already exist."

# ── Start with PM2 ──────────────────────────────────────────
echo "→ Starting teletherapy app on port 3002..."
if pm2 describe scei-teletherapy >/dev/null 2>&1; then
  pm2 restart scei-teletherapy
  echo "✅  Restarted existing process."
else
  PORT=3002 HOSTNAME=0.0.0.0 pm2 start npm --name scei-teletherapy -- start
  pm2 save
  echo "✅  Started new process."
fi

# ── SSL certificate ─────────────────────────────────────────
echo ""
echo "→ Checking SSL certificate for teletherapy.sapphireclinicseast.org..."
if [ -d "/etc/letsencrypt/live/teletherapy.sapphireclinicseast.org" ]; then
  echo "✅  SSL certificate already exists."
else
  echo "→ Obtaining SSL certificate..."
  certbot certonly --nginx -d teletherapy.sapphireclinicseast.org --non-interactive --agree-tos -m admin@sapphireclinicseast.org 2>/dev/null \
    && echo "✅  SSL certificate obtained." \
    || echo "⚠  SSL setup failed. Run manually: certbot certonly --nginx -d teletherapy.sapphireclinicseast.org"
fi

# ── Reload Nginx ─────────────────────────────────────────────
echo "→ Reloading Nginx..."
nginx -t && systemctl reload nginx

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ✅  Teletherapy deployed!"
echo ""
echo "  URL: https://teletherapy.sapphireclinicseast.org"
echo ""
echo "  Admin login:"
echo "  Email:    admin@sapphireclinicseast.org"
echo "  Password: teletherapy2026"
echo ""
echo "  ⚠  Change the default password after first login!"
echo "═══════════════════════════════════════════════════════"
echo ""
