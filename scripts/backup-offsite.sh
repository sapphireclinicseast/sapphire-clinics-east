#!/bin/bash
# ============================================================
# Daily SECOND backup — runs at 3 AM after the primary 2 AM dumps.
# Combines:
#   - Marketing DB (sapphire_marketing)
#   - Accounting DB (sapphire_accounting, if container exists)
#   - Marketing uploads (referrals, queue ads, email images, …)
#   - Teletherapy uploads (session notes + patient documents:
#       Initial Evaluation, Progress Reports, Other Documents)
#   - Encrypted env files (.env.production)
# All into /opt/backups-offsite/ — local mirror on the VPS.
#
# OFFSITE PUSH (rclone): runs automatically if a remote called
# "offsite" exists in rclone config. Pushes nightly to:
#   <remote>:sapphire/db/         → DB dumps
#   <remote>:sapphire/uploads/    → marketing uploads
#   <remote>:sapphire/teletherapy/→ teletherapy uploads
#   <remote>:sapphire/env/        → encrypted env files
#
# To enable Google Drive backup, run ONCE on the VPS:
#     rclone config
# and add a remote called "offsite" pointing at Google Drive.
# ============================================================
set -e

TS=$(date +%Y%m%d_%H%M%S)
DEST=/opt/backups-offsite
KEEP_DAYS=30

mkdir -p "$DEST"
chmod 700 "$DEST"

echo "[offsite] ── $(date "+%Y-%m-%d %H:%M:%S") ──────────────"

# ── Marketing DB ─────────────────────────────────────────────
echo "[offsite] Dumping marketing database..."
docker exec sapphire_db pg_dump -U sapphire sapphire_marketing 2>/dev/null \
  | gzip > "$DEST/marketing_${TS}.sql.gz"
echo "[offsite] Marketing: $(du -h "$DEST/marketing_${TS}.sql.gz" | cut -f1)"

# ── Marketing uploads (referrals, queue ads, email images, …)
if [ -d /opt/sapphire/uploads ]; then
  echo "[offsite] Tarring marketing uploads..."
  tar czf "$DEST/sapphire_uploads_${TS}.tar.gz" \
    -C /opt/sapphire uploads 2>/dev/null
  echo "[offsite] Uploads: $(du -h "$DEST/sapphire_uploads_${TS}.tar.gz" | cut -f1)"
fi

# ── Teletherapy uploads (session notes, patient docs: IE/Progress/Other)
# Lives under the deployed app dir, separate filesystem path from marketing
TELE_UPLOADS=/var/www/sapphireclinicseast.org/teletherapy/uploads
if [ -d "$TELE_UPLOADS" ]; then
  echo "[offsite] Tarring teletherapy uploads (session notes + patient docs)..."
  tar czf "$DEST/teletherapy_uploads_${TS}.tar.gz" \
    -C /var/www/sapphireclinicseast.org/teletherapy uploads 2>/dev/null
  if [ -s "$DEST/teletherapy_uploads_${TS}.tar.gz" ]; then
    echo "[offsite] Teletherapy uploads: $(du -h "$DEST/teletherapy_uploads_${TS}.tar.gz" | cut -f1)"
  else
    rm -f "$DEST/teletherapy_uploads_${TS}.tar.gz"
    echo "[offsite] Teletherapy uploads dir empty — skipped tarball"
  fi
fi

# ── Accounting DB ────────────────────────────────────────────
if docker ps --format "{{.Names}}" | grep -q "^accounting_db$"; then
  echo "[offsite] Dumping accounting database..."
  docker exec accounting_db pg_dump -U sapphire sapphire_accounting 2>/dev/null \
    | gzip > "$DEST/accounting_${TS}.sql.gz"
  echo "[offsite] Accounting: $(du -h "$DEST/accounting_${TS}.sql.gz" | cut -f1)"
fi

# ── Encrypted env (passwords + secrets) ──────────────────────
ENV_PASS="${BACKUP_ENV_PASS:-}"
if [ -z "$ENV_PASS" ] && [ -f /root/.backup-env-pass ]; then
  ENV_PASS=$(cat /root/.backup-env-pass)
fi
if [ -n "$ENV_PASS" ]; then
  ENV_TARGZ="$DEST/env_${TS}.tar.gz"
  ENV_ENC="$DEST/env_${TS}.tar.gz.enc"
  tar czf "$ENV_TARGZ" \
    -C / \
    opt/sapphire/docker/.env.production \
    opt/sapphire-marketing-hub/accounting-hub/docker/.env.production 2>/dev/null || true
  if [ -f "$ENV_TARGZ" ]; then
    openssl enc -aes-256-cbc -salt -pbkdf2 -in "$ENV_TARGZ" -out "$ENV_ENC" \
      -pass pass:"$ENV_PASS"
    rm -f "$ENV_TARGZ"
    echo "[offsite] Env files encrypted"
  fi
else
  echo "[offsite] (env encryption skipped — no /root/.backup-env-pass)"
fi

# ── Retention: keep last N days ─────────────────────────────
find "$DEST" -name "*.gz" -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true
find "$DEST" -name "*.enc" -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true
COUNT=$(ls "$DEST" 2>/dev/null | wc -l)
echo "[offsite] $COUNT file(s) retained (${KEEP_DAYS}-day retention)"

# ── ONLINE / OFFSITE PUSH (rclone) ───────────────────────────
# Auto-runs if and only if an rclone remote named "offsite" exists.
# To set this up, run ONCE on the VPS:
#     rclone config
# and add a remote called "offsite" pointing at your destination
# (Cloudflare R2, Backblaze B2, S3, Drive, OneDrive, sftp, etc.).
# Once thatâs done, every nightly run will push fresh DB + uploads
# tarballs into <remote>/sapphire/{db,uploads,env}/.
if rclone listremotes 2>/dev/null | grep -q "^offsite:$"; then
  echo "[offsite] Pushing to rclone remote \"offsite\"..."
  rclone copy --no-traverse --transfers=2 \
    "$DEST/marketing_${TS}.sql.gz" offsite:sapphire/db/ 2>&1 \
    | tail -3
  rclone copy --no-traverse --transfers=2 \
    "$DEST/sapphire_uploads_${TS}.tar.gz" offsite:sapphire/uploads/ 2>&1 \
    | tail -3
  # Teletherapy uploads (session notes + patient documents)
  if [ -f "$DEST/teletherapy_uploads_${TS}.tar.gz" ]; then
    rclone copy --no-traverse --transfers=2 \
      "$DEST/teletherapy_uploads_${TS}.tar.gz" offsite:sapphire/teletherapy/ 2>&1 \
      | tail -3
  fi
  if [ -f "$DEST/accounting_${TS}.sql.gz" ]; then
    rclone copy --no-traverse --transfers=2 \
      "$DEST/accounting_${TS}.sql.gz" offsite:sapphire/db/ 2>&1 \
      | tail -3
  fi
  if [ -f "$DEST/env_${TS}.tar.gz.enc" ]; then
    rclone copy --no-traverse "$DEST/env_${TS}.tar.gz.enc" offsite:sapphire/env/ 2>&1 | tail -3
  fi
  # Mirror the retention policy on the remote
  rclone delete --min-age ${KEEP_DAYS}d offsite:sapphire/db/ 2>/dev/null || true
  rclone delete --min-age ${KEEP_DAYS}d offsite:sapphire/uploads/ 2>/dev/null || true
  rclone delete --min-age ${KEEP_DAYS}d offsite:sapphire/teletherapy/ 2>/dev/null || true
  rclone delete --min-age ${KEEP_DAYS}d offsite:sapphire/env/ 2>/dev/null || true
  echo "[offsite] â Pushed to offsite"
else
  echo "[offsite] (online push skipped â no rclone remote called \"offsite\" configured yet)"
  echo "[offsite]   To enable, run on the VPS: rclone config   (add remote name \"offsite\")"
fi

echo "[offsite] ── Done ────────────────────────────────────"
