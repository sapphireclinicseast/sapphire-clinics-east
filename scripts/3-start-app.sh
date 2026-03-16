#!/bin/bash
# ============================================================
# SAPPHIRE Marketing Hub — Step 3: Start Application
# ============================================================
# Run this on the VPS after completing server setup and
# creating /opt/sapphire/docker/.env.production
# ============================================================

set -e

APP_DIR="/opt/sapphire"
DOCKER_DIR="$APP_DIR/docker"
ENV_FILE="$DOCKER_DIR/.env.production"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  SAPPHIRE Marketing Hub — Starting Application"
echo "═══════════════════════════════════════════════════════"
echo ""

# ── Check .env.production exists ─────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  echo "❌  Missing: $ENV_FILE"
  echo ""
  echo "   Please create it first:"
  echo "   cp $DOCKER_DIR/.env.production.example $ENV_FILE"
  echo "   nano $ENV_FILE"
  echo ""
  exit 1
fi

# ── Check NEXTAUTH_SECRET is set ─────────────────────────────
if grep -q "REPLACE_WITH_OUTPUT" "$ENV_FILE"; then
  echo "❌  NEXTAUTH_SECRET has not been set yet."
  echo ""
  echo "   Generate one with:  openssl rand -base64 32"
  echo "   Then edit:          nano $ENV_FILE"
  echo ""
  exit 1
fi

# ── Check POSTGRES_PASSWORD is changed ───────────────────────
if grep -q "change_me_to_a_strong_password_123" "$ENV_FILE"; then
  echo "❌  POSTGRES_PASSWORD is still the default. Please change it."
  echo "   Edit: nano $ENV_FILE"
  echo ""
  exit 1
fi

# ── Use HTTP-only nginx for initial startup (before SSL) ─────
echo "→ Configuring nginx for HTTP-only mode (SSL comes in Step 4)..."
cp "$DOCKER_DIR/nginx-init.conf" "$DOCKER_DIR/nginx.conf"

# ── Build Docker images ──────────────────────────────────────
echo "→ Building Docker images (3–5 minutes on first run)..."
cd "$DOCKER_DIR"
docker compose --env-file "$ENV_FILE" build

# ── Start database and redis first ───────────────────────────
echo "→ Starting database and Redis..."
docker compose --env-file "$ENV_FILE" up -d postgres redis

echo "→ Waiting for database to be ready (15 seconds)..."
sleep 15

# ── Run database migrations ───────────────────────────────────
echo "→ Running database migrations..."
docker compose --env-file "$ENV_FILE" run --rm migrate \
  && echo "✅  Migrations complete." \
  || echo "⚠  Migrations may have already run, continuing."

# ── Start all remaining services ─────────────────────────────
echo "→ Starting all services..."
docker compose --env-file "$ENV_FILE" up -d

echo "→ Waiting for the app to finish starting (30 seconds)..."
sleep 30

# ── Seed the default admin user via SQL ──────────────────────
echo "→ Creating default admin user..."
# bcrypt hash for "SCEIAdmin2026!" generated with 12 rounds
docker exec sapphire_db psql -U sapphire -d sapphire_marketing -c "
INSERT INTO \"User\" (id, name, email, \"passwordHash\", role, \"createdAt\", \"updatedAt\")
VALUES (
  'cldefaultadmin001',
  'SCEI Admin',
  'admin@sapphireclinicseast.org',
  '\$2b\$12\$UpjvHqhbig764H9E71ZJ5uo8P9SBXK4zeT27FXYueiJCjgFB66qRS',
  'ADMIN',
  NOW(),
  NOW()
) ON CONFLICT (email) DO NOTHING;
" 2>/dev/null && echo "✅  Admin user ready." || echo "⚠  Note: Admin user may already exist, continuing."

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ✅  Application started!"
echo ""
echo "  Your app is now running at:"
echo "  http://marketing.sapphireclinicseast.org"
echo "  (or http://YOUR_VPS_IP if DNS isn't set up yet)"
echo ""
echo "  Default login:"
echo "  Email:    admin@sapphireclinicseast.org"
echo "  Password: SCEIAdmin2026!"
echo ""
echo "  ⚠  IMPORTANT: Change the default password after login!"
echo ""
echo "  Next step — set up HTTPS (SSL):"
echo "  1. Make sure your DNS A record points to this server"
echo "  2. Visit http://marketing.sapphireclinicseast.org"
echo "     to confirm the site loads"
echo "  3. Then run: bash /opt/sapphire/scripts/4-setup-ssl.sh"
echo "═══════════════════════════════════════════════════════"
echo ""
