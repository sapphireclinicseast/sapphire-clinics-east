#!/bin/bash
# Ensure the DB password matches POSTGRES_PASSWORD on every container start.
# This fixes the issue where the volume already has a different password
# from the initial setup, and POSTGRES_PASSWORD only applies on first init.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    ALTER USER $POSTGRES_USER WITH PASSWORD '$POSTGRES_PASSWORD';
EOSQL
