#!/bin/bash
# Quick redeploy for SAPPHIRE Teletherapy
# Rebuilds app image and restarts container.
set -e
cd /opt/sapphire/teletherapy/docker

echo "Building app image..."
docker compose build --no-cache teletherapy_app

echo "Restarting container..."
docker compose up -d --force-recreate teletherapy_app

echo "Redeploy complete."
