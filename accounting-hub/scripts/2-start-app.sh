#!/bin/bash
# ============================================================
# SAPPHIRE Accounting Hub — Step 2: Start Application
# ============================================================
# Run this on the VPS after uploading code and creating
# /opt/accounting/docker/.env.production
# ============================================================

set -e

APP_DIR="/opt/accounting"
DOCKER_DIR="$APP_DIR/docker"
ENV_FILE="$DOCKER_DIR/.env.production"

echo ""
echo "  SAPPHIRE Accounting Hub — Starting Application"
echo ""

# ── Check .env.production exists
if [ ! -f "$ENV_FILE" ]; then
  echo "  Missing: $ENV_FILE"
  echo "  Please create it first:"
  echo "  cp $DOCKER_DIR/.env.production.example $ENV_FILE"
  echo "  nano $ENV_FILE"
  exit 1
fi

# ── Check NEXTAUTH_SECRET is set
if grep -q "REPLACE_WITH" "$ENV_FILE"; then
  echo "  NEXTAUTH_SECRET has not been set yet."
  echo "  Generate one with:  openssl rand -base64 32"
  echo "  Then edit:          nano $ENV_FILE"
  exit 1
fi

# ── Check POSTGRES_PASSWORD is changed
if grep -q "change_me_to_a_strong_password" "$ENV_FILE"; then
  echo "  POSTGRES_PASSWORD is still the default. Please change it."
  echo "  Edit: nano $ENV_FILE"
  exit 1
fi

# ── Build Docker images
echo "  Building Docker images (3-5 minutes on first run)..."
cd "$DOCKER_DIR"
docker compose --env-file "$ENV_FILE" build

# ── Start database first
echo "  Starting database..."
docker compose --env-file "$ENV_FILE" up -d postgres

echo "  Waiting for database to be ready (15 seconds)..."
sleep 15

# ── Run database migrations
echo "  Running database migrations..."
docker compose --env-file "$ENV_FILE" run --rm migrate \
  && echo "  Migrations complete." \
  || echo "  Migrations may have already run, continuing."

# ── Start all remaining services
echo "  Starting all services..."
docker compose --env-file "$ENV_FILE" up -d

echo "  Waiting for the app to finish starting (20 seconds)..."
sleep 20

# ── Seed the default admin user via SQL
echo "  Creating default admin user..."
# bcrypt hash for "SCEIAccounting2026!" generated with 12 rounds
docker exec accounting_db psql -U sapphire -d sapphire_accounting -c "
INSERT INTO \"User\" (id, name, email, \"passwordHash\", role, \"createdAt\", \"updatedAt\")
VALUES (
  'cldefaultadmin001',
  'System Admin',
  'admin@sapphireclinicseast.org',
  '\$2b\$12\$dpcgc.4mLAFMQbFIM0d0L.yU4GhzI02kUiPEUyrhJng5/8eLE/vMa',
  'ADMIN',
  NOW(),
  NOW()
) ON CONFLICT (email) DO NOTHING;
" 2>/dev/null && echo "  Admin user ready." || echo "  Note: Admin user may already exist, continuing."

echo ""
echo "  Application started!"
echo ""
echo "  Your app is now running at:"
echo "  http://accounting.sapphireclinicseast.org"
echo ""
echo "  Default login:"
echo "  Email:    admin@sapphireclinicseast.org"
echo "  Password: SCEIAccounting2026!"
echo ""
echo "  IMPORTANT: Change the default password after login!"
echo ""
echo "  Next step — set up HTTPS (SSL):"
echo "  bash /opt/accounting/scripts/3-setup-ssl.sh"
echo ""
