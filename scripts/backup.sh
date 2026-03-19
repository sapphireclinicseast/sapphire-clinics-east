#!/bin/bash
# ============================================================
# SAPPHIRE Marketing Hub — Daily Database Backup
# ============================================================
# Runs inside the VPS via cron at 2:00 AM daily.
# Keeps 7 local copies, then uploads to offsite storage.
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
KEEP_DAYS=7

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

# ── Remove old backups (keep last N days) ────────────────────
echo "[backup] Pruning backups older than ${KEEP_DAYS} days..."
find "$BACKUP_DIR" -name "sapphire_*.sql.gz" -mtime +"$KEEP_DAYS" -delete
REMAINING=$(ls "$BACKUP_DIR"/sapphire_*.sql.gz 2>/dev/null | wc -l)
echo "[backup] ${REMAINING} backup(s) retained locally."

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
