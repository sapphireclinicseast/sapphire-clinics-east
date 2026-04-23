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
docker compose up -d --force-recreate --no-deps app
docker compose up -d postgres

echo "Syncing database password..."
PGPASS=$(grep "^POSTGRES_PASSWORD=" .env | cut -d= -f2-)
docker exec accounting_db psql -U sapphire -d sapphire_accounting \
  -c "ALTER USER sapphire WITH PASSWORD '$PGPASS';" 2>/dev/null \
  && echo "Password synced." \
  || echo "Warning: password sync failed — run ALTER USER manually if login fails."

echo "Redeploy complete."
