#!/bin/bash
# ============================================================
# SAPPHIRE Accounting Hub — Daily Database Backup
# ============================================================
# Runs inside the VPS via cron at 2:30 AM daily.
# Keeps 14 local copies (accounting data is critical).
#
# Cron entry (add with: crontab -e):
#   30 2 * * * /opt/accounting/scripts/backup.sh >> /var/log/accounting-backup.log 2>&1
# ============================================================

set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/accounting/backups"
FILENAME="accounting_${TIMESTAMP}.sql.gz"
FULL_PATH="${BACKUP_DIR}/${FILENAME}"
ENV_FILE="/opt/accounting/docker/.env.production"
KEEP_DAYS=14

# ── Load environment
if [ -f "$ENV_FILE" ]; then
  source "$ENV_FILE"
fi

DB_PASSWORD="${POSTGRES_PASSWORD:-}"
if [ -z "$DB_PASSWORD" ]; then
  echo "[accounting-backup] ERROR: POSTGRES_PASSWORD not set. Aborting."
  exit 1
fi

echo "[accounting-backup] ── $(date '+%Y-%m-%d %H:%M:%S') ──────────────"

# ── Create backup directory
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# ── Dump the database
echo "[accounting-backup] Dumping database..."
docker exec accounting_db \
  pg_dump -U sapphire sapphire_accounting | gzip > "$FULL_PATH"

SIZE=$(du -sh "$FULL_PATH" | cut -f1)
echo "[accounting-backup] Dump complete: $FILENAME ($SIZE)"

# ── Remove old backups (keep last N days)
echo "[accounting-backup] Pruning backups older than ${KEEP_DAYS} days..."
find "$BACKUP_DIR" -name "accounting_*.sql.gz" -mtime +"$KEEP_DAYS" -delete
REMAINING=$(ls "$BACKUP_DIR"/accounting_*.sql.gz 2>/dev/null | wc -l)
echo "[accounting-backup] ${REMAINING} backup(s) retained locally."

echo "[accounting-backup] ── Done ─────────────────────────────────────"
