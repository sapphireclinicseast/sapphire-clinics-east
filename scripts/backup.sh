#!/bin/bash
# ============================================================
# SAPPHIRE Marketing Hub — Daily Backup (Database + Uploads)
# ============================================================
# Runs inside the VPS via cron at 2:00 AM daily.
# Backs up BOTH the Postgres DB and the /opt/sapphire/uploads/
# directory (referrals, queue ads, email images, brand guides).
# Keeps 30 local copies, then uploads to offsite storage.
#
# Cron entry (add with: crontab -e):
#   0 2 * * * /opt/sapphire/scripts/backup.sh >> /var/log/sapphire-backup.log 2>&1
# ============================================================

set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/sapphire/backups"
FILENAME="sapphire_${TIMESTAMP}.sql.gz"
FULL_PATH="${BACKUP_DIR}/${FILENAME}"
ENV_FILE="/opt/sapphire/docker/.env.production"
KEEP_DAYS=30

# ── Load environment ─────────────────────────────────────────
if [ -f "$ENV_FILE" ]; then
  source "$ENV_FILE"
fi

DB_PASSWORD="${POSTGRES_PASSWORD:-}"
if [ -z "$DB_PASSWORD" ]; then
  echo "[backup] ERROR: POSTGRES_PASSWORD not set. Aborting."
  exit 1
fi

echo "[backup] ── $(date '+%Y-%m-%d %H:%M:%S') ─────────────────────────"

# ── Create backup directory ──────────────────────────────────
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# ── Dump the database ────────────────────────────────────────
echo "[backup] Dumping database..."
docker exec sapphire_db \
  pg_dump -U sapphire sapphire_marketing | gzip > "$FULL_PATH"

SIZE=$(du -sh "$FULL_PATH" | cut -f1)
echo "[backup] ✅  Dump complete: $FILENAME ($SIZE)"

# ── Tar /opt/sapphire/uploads (referrals, queue ads, email images, etc.)
UPLOADS_DIR="/opt/sapphire/uploads"
UPLOADS_FILENAME="sapphire_uploads_${TIMESTAMP}.tar.gz"
UPLOADS_FULL_PATH="${BACKUP_DIR}/${UPLOADS_FILENAME}"
if [ -d "$UPLOADS_DIR" ]; then
  echo "[backup] Tarring uploads dir..."
  tar czf "$UPLOADS_FULL_PATH" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")" 2>/dev/null
  USIZE=$(du -sh "$UPLOADS_FULL_PATH" | cut -f1)
  UCOUNT=$(find "$UPLOADS_DIR" -type f 2>/dev/null | wc -l)
  echo "[backup] ✅  Uploads tar: $UPLOADS_FILENAME ($USIZE, $UCOUNT files)"
else
  echo "[backup] ⚠  $UPLOADS_DIR not found — skipping uploads tar."
fi

# ── Snapshot the marketing hub SOURCE TREE so any local hand-deployed changes
# are preserved alongside the DB + uploads. Without this, a stale-checkout
# accident or accidental hard-reset could wipe in-flight work that hadn't been
# committed to GitHub yet. Skips heavy dirs (node_modules, .next, .git).
HUB_SRC_DIR="/opt/sapphire-marketing-hub"
HUB_SRC_FILENAME="sapphire_hub_src_${TIMESTAMP}.tar.gz"
HUB_SRC_FULL_PATH="${BACKUP_DIR}/${HUB_SRC_FILENAME}"
if [ -d "$HUB_SRC_DIR" ]; then
  echo "[backup] Snapshotting marketing-hub source tree..."
  tar czf "$HUB_SRC_FULL_PATH" \
    --exclude='node_modules' \
    --exclude='.next' \
    --exclude='.git' \
    --exclude='accounting-hub/node_modules' \
    --exclude='accounting-hub/.next' \
    --exclude='client-portal/node_modules' \
    --exclude='client-portal/.next' \
    --exclude='*.log' \
    -C "$(dirname "$HUB_SRC_DIR")" "$(basename "$HUB_SRC_DIR")" 2>/dev/null
  SSIZE=$(du -sh "$HUB_SRC_FULL_PATH" | cut -f1)
  echo "[backup] ✅  Source snapshot: $HUB_SRC_FILENAME ($SSIZE)"
fi

# ── Remove old backups (keep last N days) ────────────────────
echo "[backup] Pruning DB backups older than ${KEEP_DAYS} days..."
find "$BACKUP_DIR" -name "sapphire_*.sql.gz" -mtime +"$KEEP_DAYS" -delete
REMAINING=$(ls "$BACKUP_DIR"/sapphire_*.sql.gz 2>/dev/null | wc -l)
echo "[backup] ${REMAINING} DB backup(s) retained locally."

echo "[backup] Pruning uploads tarballs older than ${KEEP_DAYS} days..."
find "$BACKUP_DIR" -name "sapphire_uploads_*.tar.gz" -mtime +"$KEEP_DAYS" -delete
UREMAINING=$(ls "$BACKUP_DIR"/sapphire_uploads_*.tar.gz 2>/dev/null | wc -l)
echo "[backup] ${UREMAINING} uploads tarball(s) retained locally."

echo "[backup] Pruning source snapshots older than ${KEEP_DAYS} days..."
find "$BACKUP_DIR" -name "sapphire_hub_src_*.tar.gz" -mtime +"$KEEP_DAYS" -delete
SREMAINING=$(ls "$BACKUP_DIR"/sapphire_hub_src_*.tar.gz 2>/dev/null | wc -l)
echo "[backup] ${SREMAINING} source snapshot(s) retained locally."

# ── Offsite upload (optional — configure one option below) ───
#
# Option A — Backblaze B2 (install: apt install b2-tools)
#   Replace YOUR_BUCKET with your B2 bucket name
#   Uncomment and fill in credentials:
#
# export B2_APPLICATION_KEY_ID="your_key_id"
# export B2_APPLICATION_KEY="your_app_key"
# b2 authorize-account "$B2_APPLICATION_KEY_ID" "$B2_APPLICATION_KEY"
# b2 upload-file YOUR_BUCKET "$FULL_PATH" "backups/$FILENAME"
# echo "[backup] ✅  Uploaded to Backblaze B2: backups/$FILENAME"
#
# Option B — Cloudflare R2 via rclone (install: apt install rclone)
#   Configure rclone with: rclone config
#   Remote name: r2, Bucket: sapphire-backups
#
# rclone copy "$FULL_PATH" r2:sapphire-backups/
# echo "[backup] ✅  Uploaded to Cloudflare R2"
#
# Option C — scp to a second server
#
# scp "$FULL_PATH" backup@YOUR_BACKUP_SERVER:/backups/
# echo "[backup] ✅  Copied to backup server"

echo "[backup] ── Done ──────────────────────────────────────────────"
