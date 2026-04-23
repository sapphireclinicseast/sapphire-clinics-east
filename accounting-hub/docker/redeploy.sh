#!/bin/bash
# Quick redeploy for SAPPHIRE Accounting Hub
# Rebuilds app image, restarts containers, and syncs DB password
set -e
cd /opt/accounting/docker

echo "Building app image..."
docker compose build --no-cache app

echo "Restarting containers..."
# Force-recreate the app so any .env changes (DATABASE_URL etc.) are picked up.
# Without this, docker compose can leave the old container running with stale env.
# Listing the service name ('app') and --force-recreate limits the recreation
# to the app container — postgres is brought up (or left running) as a dep but
# never recreated, so no data-volume re-init race.
docker compose up -d --force-recreate app

echo "Waiting for postgres to be healthy..."
for i in $(seq 1 20); do
  if docker exec accounting_db pg_isready -U sapphire -d sapphire_accounting >/dev/null 2>&1; then
    echo "  postgres ready."
    break
  fi
  sleep 1
done

echo "Syncing database password..."
PGPASS=$(grep "^POSTGRES_PASSWORD=" .env | cut -d= -f2-)
docker exec accounting_db psql -U sapphire -d sapphire_accounting \
  -c "ALTER USER sapphire WITH PASSWORD '$PGPASS';" 2>/dev/null \
  && echo "Password synced." \
  || echo "Warning: password sync failed — run ALTER USER manually if login fails."

echo "Applying additive schema changes (IF NOT EXISTS — idempotent)..."
docker exec accounting_db psql -U sapphire -d sapphire_accounting <<'SQL'
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "arProofUrl" TEXT;
SQL

echo "Redeploy complete."
