#!/bin/bash
# Deploy verdana-store to VPS
# Excludes user data (uploads, product-images.json) and VPS store-data.json

set -e

VPS="root@152.53.231.249"
KEY="$HOME/.ssh/scei_deploy"
REMOTE="/var/www/verdanarehab.com"

echo "==> Syncing files..."
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.env.local' \
  --exclude='prisma/generated' \
  --exclude='public/uploads' \
  --exclude='src/data/product-images.json' \
  --exclude='src/data/store-data.json' \
  --exclude='src/data/settings.json' \
  --exclude='src/data/orders.json' \
  -e "ssh -i $KEY" \
  ./ "$VPS:$REMOTE/"

echo "==> Building..."
ssh -i "$KEY" "$VPS" "cd $REMOTE && npm run build"

echo "==> Restarting..."
ssh -i "$KEY" "$VPS" "cd $REMOTE && pm2 restart verdana-store"

echo "==> Done!"
