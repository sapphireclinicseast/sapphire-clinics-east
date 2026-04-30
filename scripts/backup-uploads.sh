#!/bin/bash
# ============================================================
# SAPPHIRE Marketing Hub — Daily Uploads Backup
# ============================================================
# Tars /opt/sapphire/uploads (referrals, queue ads, email images,
# brand guides, etc.) into a daily snapshot. Keeps 30 days local
# under /opt/sapphire/backups/uploads/, and copies the latest
# snapshot to /opt/backups-offsite/ for any offsite sync to pick
# up (matching the existing DB backup pattern).
#
# Cron: 0 2 * * * /opt/sapphire/scripts/backup-uploads.sh >> \
#                  /var/log/sapphire-uploads-backup.log 2>&1
# ============================================================
set -e

UPLOADS_DIR="/opt/sapphire/uploads"
LOCAL_BACKUP_DIR="/opt/sapphire/backups/uploads"
OFFSITE_DIR="/opt/backups-offsite"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="uploads_${TIMESTAMP}.tar.gz"
KEEP_DAYS=30

mkdir -p "$LOCAL_BACKUP_DIR"
chmod 700 "$LOCAL_BACKUP_DIR"
mkdir -p "$OFFSITE_DIR"

if [ ! -d "$UPLOADS_DIR" ]; then
  echo "[uploads-backup] ERROR: $UPLOADS_DIR not found. Aborting."
  exit 1
fi

echo "[uploads-backup] $(date "+%Y-%m-%d %H:%M:%S") starting..."

# Create the tarball locally
tar czf "$LOCAL_BACKUP_DIR/$FILENAME" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")"
SIZE=$(du -sh "$LOCAL_BACKUP_DIR/$FILENAME" | cut -f1)
COUNT=$(find "$UPLOADS_DIR" -type f 2>/dev/null | wc -l)
echo "[uploads-backup] tarball: $FILENAME ($SIZE, $COUNT files)"

# Copy to offsite-ready dir (rsync mirrors latest only)
cp "$LOCAL_BACKUP_DIR/$FILENAME" "$OFFSITE_DIR/$FILENAME"
echo "[uploads-backup] copied to offsite staging: $OFFSITE_DIR/$FILENAME"

# Prune local copies older than KEEP_DAYS days
find "$LOCAL_BACKUP_DIR" -name "uploads_*.tar.gz" -mtime +"$KEEP_DAYS" -delete
LOCAL_REMAINING=$(ls "$LOCAL_BACKUP_DIR"/uploads_*.tar.gz 2>/dev/null | wc -l)
echo "[uploads-backup] $LOCAL_REMAINING local snapshot(s) retained."

# Prune offsite-staging older than 7 days (offsite sync should ship daily)
find "$OFFSITE_DIR" -name "uploads_*.tar.gz" -mtime +7 -delete

# ── Optional offsite sync (uncomment one) ────────────────────
# Option A — rsync to a backup server over SSH:
#   rsync -avz "$LOCAL_BACKUP_DIR/$FILENAME" backup@your-backup-host:/backups/sapphire/uploads/
#
# Option B — Backblaze B2:
#   b2 upload-file YOUR_BUCKET "$LOCAL_BACKUP_DIR/$FILENAME" "backups/uploads/$FILENAME"
#
# Option C — Cloudflare R2 (rclone):
#   rclone copy "$LOCAL_BACKUP_DIR/$FILENAME" r2:sapphire-backups/uploads/

echo "[uploads-backup] done."
