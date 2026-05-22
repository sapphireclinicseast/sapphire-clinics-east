#!/bin/bash
# ============================================================
# Daily SECOND backup — runs at 3 AM after the primary 2 AM dumps.
# Combines marketing + accounting DBs, marketing uploads, and
# encrypted env files into /opt/backups-offsite/ (a separate dir
# on the VPS so you have a local mirror to copy off-server).
#
# OFFSITE PUSH: see the bottom of this script. Three options
# (rclone / B2 / rsync) are commented out — uncomment ONE and
# fill in your destination to start shipping daily off-VPS.
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

# ── Marketing-hub SOURCE TREE snapshot (preserves hand-deployed changes)
if [ -d /opt/sapphire-marketing-hub ]; then
  echo "[offsite] Snapshotting marketing-hub source tree..."
  tar czf "$DEST/sapphire_hub_src_${TS}.tar.gz" \
    --exclude='node_modules' --exclude='.next' --exclude='.git' \
    --exclude='accounting-hub/node_modules' --exclude='accounting-hub/.next' \
    --exclude='client-portal/node_modules' --exclude='client-portal/.next' \
    --exclude='*.log' \
    -C /opt sapphire-marketing-hub 2>/dev/null
  echo "[offsite] Source: $(du -h "$DEST/sapphire_hub_src_${TS}.tar.gz" | cut -f1)"
fi

# ── HR Platform DATA (JSON files — small, critical) ───────────────
if [ -d /var/www/hr.sapphireclinicseast.org/api/data ]; then
  echo "[offsite] Snapshotting HR Platform data..."
  tar czf "$DEST/hr_data_${TS}.tar.gz" \
    -C /var/www/hr.sapphireclinicseast.org/api data 2>/dev/null
  echo "[offsite] HR data: $(du -h "$DEST/hr_data_${TS}.tar.gz" | cut -f1)"
fi

# ── HR Platform UPLOADS (PDFs, attachments — large, push to Drive) ──
if [ -d /var/www/hr.sapphireclinicseast.org/uploads ]; then
  echo "[offsite] Snapshotting HR Platform uploads..."
  tar czf "$DEST/hr_uploads_${TS}.tar.gz" \
    --exclude='*.tmp' \
    -C /var/www/hr.sapphireclinicseast.org uploads 2>/dev/null
  echo "[offsite] HR uploads: $(du -h "$DEST/hr_uploads_${TS}.tar.gz" | cut -f1)"
fi

# ── Teletherapy UPLOADS (patient docs, session notes — critical) ──
if [ -d /var/www/sapphireclinicseast.org/teletherapy/uploads ]; then
  echo "[offsite] Snapshotting teletherapy uploads..."
  tar czf "$DEST/teletherapy_uploads_${TS}.tar.gz" \
    -C /var/www/sapphireclinicseast.org/teletherapy uploads 2>/dev/null
  echo "[offsite] Teletherapy uploads: $(du -h "$DEST/teletherapy_uploads_${TS}.tar.gz" | cut -f1)"
fi

# ── System config (nginx, letsencrypt, root crontab) ─────────────
echo "[offsite] Snapshotting system config..."
tar czf "$DEST/system_config_${TS}.tar.gz" \
  --warning=no-file-changed \
  /etc/nginx/sites-available \
  /etc/nginx/sites-enabled \
  /etc/nginx/snippets \
  /etc/letsencrypt 2>/dev/null
crontab -l > "$DEST/crontab_${TS}.txt" 2>/dev/null || true
echo "[offsite] System config: $(du -h "$DEST/system_config_${TS}.tar.gz" | cut -f1)"

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
# Local prune — heavy uploads kept 7 days, lightweight kept 30
find "$DEST" -name "hr_uploads_*.tar.gz"          -mtime +7 -delete 2>/dev/null || true
find "$DEST" -name "teletherapy_uploads_*.tar.gz" -mtime +7 -delete 2>/dev/null || true
find "$DEST" -name "sapphire_uploads_*.tar.gz"    -mtime +7 -delete 2>/dev/null || true
find "$DEST" -name "*.gz"  -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true
find "$DEST" -name "*.txt" -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true
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
  # MOVE: delete local copy on successful Drive upload (heavy ~265MB)
  rclone move --no-traverse --transfers=2 \
    "$DEST/sapphire_uploads_${TS}.tar.gz" offsite:sapphire/uploads/ 2>&1 \
    | tail -3
  if [ -f "$DEST/sapphire_hub_src_${TS}.tar.gz" ]; then
    rclone copy --no-traverse --transfers=2 \
      "$DEST/sapphire_hub_src_${TS}.tar.gz" offsite:sapphire/source/ 2>&1 \
      | tail -3
  fi
  # HR Platform data + uploads
  if [ -f "$DEST/hr_data_${TS}.tar.gz" ]; then
    rclone copy --no-traverse "$DEST/hr_data_${TS}.tar.gz" offsite:sapphire/hr/data/ 2>&1 | tail -3
  fi
  if [ -f "$DEST/hr_uploads_${TS}.tar.gz" ]; then
    # MOVE: delete local copy on successful Drive upload (heavy ~1.3GB)
    rclone move --no-traverse --transfers=2 \
      "$DEST/hr_uploads_${TS}.tar.gz" offsite:sapphire/hr/uploads/ 2>&1 | tail -3
  fi
  # Teletherapy uploads
  if [ -f "$DEST/teletherapy_uploads_${TS}.tar.gz" ]; then
    # MOVE: delete local copy on successful Drive upload
    rclone move --no-traverse --transfers=2 \
      "$DEST/teletherapy_uploads_${TS}.tar.gz" offsite:sapphire/teletherapy/ 2>&1 | tail -3
  fi
  # System config + crontab
  if [ -f "$DEST/system_config_${TS}.tar.gz" ]; then
    rclone copy --no-traverse "$DEST/system_config_${TS}.tar.gz" offsite:sapphire/system/ 2>&1 | tail -3
  fi
  if [ -f "$DEST/crontab_${TS}.txt" ]; then
    rclone copy --no-traverse "$DEST/crontab_${TS}.txt" offsite:sapphire/system/ 2>&1 | tail -3
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
  rclone delete --min-age ${KEEP_DAYS}d offsite:sapphire/source/ 2>/dev/null || true
  rclone delete --min-age ${KEEP_DAYS}d offsite:sapphire/hr/data/ 2>/dev/null || true
  rclone delete --min-age ${KEEP_DAYS}d offsite:sapphire/hr/uploads/ 2>/dev/null || true
  rclone delete --min-age ${KEEP_DAYS}d offsite:sapphire/teletherapy/ 2>/dev/null || true
  rclone delete --min-age ${KEEP_DAYS}d offsite:sapphire/system/ 2>/dev/null || true
  rclone delete --min-age ${KEEP_DAYS}d offsite:sapphire/env/ 2>/dev/null || true
  echo "[offsite] â Pushed to offsite"
else
  echo "[offsite] (online push skipped â no rclone remote called \"offsite\" configured yet)"
  echo "[offsite]   To enable, run on the VPS: rclone config   (add remote name \"offsite\")"
fi


# --- SECOND OFFSITE TARGET: Cloudflare R2 (rclone) --------------
# Same pattern as the offsite: block above. Only fires if an rclone
# remote named "r2" is configured. Gives provider-redundant backups
# (Google Drive + Cloudflare R2) so a single-provider lockout cannot
# take both copies.
#
# Free tier: 10GB storage + free egress on R2. We only push the
# SMALL critical tarballs (DB dumps, system config, encrypted env)
# to stay inside that quota; heavy media (uploads, source tree)
# stay on Drive only.
#
# One-time VPS setup:
#   1. Sign up at https://dash.cloudflare.com (free, no card).
#   2. R2 -> Create bucket -> name "sapphire-backups".
#   3. R2 -> Manage R2 API Tokens -> Create API token ->
#      Object Read & Write on that bucket. Note: account_id,
#      access_key_id, secret_access_key.
#   4. On the VPS run:  rclone config
#        n  (new)
#        name>  r2
#        Storage>  s3
#        provider>  Cloudflare
#        env_auth>  false
#        access_key_id>  <paste>
#        secret_access_key>  <paste>
#        region>  auto
#        endpoint>  https://<account_id>.r2.cloudflarestorage.com
#        (defaults for the rest)
#   5. Verify:  rclone lsd r2:
if rclone listremotes 2>/dev/null | grep -q "^r2:$"; then
  echo "[offsite] Pushing to rclone remote r2 (Cloudflare R2)..."
  rclone copy --no-traverse --transfers=2 \
    "$DEST/marketing_${TS}.sql.gz" r2:sapphire-backups/sapphire/db/ 2>&1 | tail -3
  if [ -f "$DEST/accounting_${TS}.sql.gz" ]; then
    rclone copy --no-traverse --transfers=2 \
      "$DEST/accounting_${TS}.sql.gz" r2:sapphire-backups/sapphire/db/ 2>&1 | tail -3
  fi
  if [ -f "$DEST/hr_data_${TS}.tar.gz" ]; then
    rclone copy --no-traverse "$DEST/hr_data_${TS}.tar.gz" r2:sapphire-backups/sapphire/hr/data/ 2>&1 | tail -3
  fi
  if [ -f "$DEST/system_config_${TS}.tar.gz" ]; then
    rclone copy --no-traverse "$DEST/system_config_${TS}.tar.gz" r2:sapphire-backups/sapphire/system/ 2>&1 | tail -3
  fi
  if [ -f "$DEST/crontab_${TS}.txt" ]; then
    rclone copy --no-traverse "$DEST/crontab_${TS}.txt" r2:sapphire-backups/sapphire/system/ 2>&1 | tail -3
  fi
  if [ -f "$DEST/env_${TS}.tar.gz.enc" ]; then
    rclone copy --no-traverse "$DEST/env_${TS}.tar.gz.enc" r2:sapphire-backups/sapphire/env/ 2>&1 | tail -3
  fi
  # Mirror retention on R2
  rclone delete --min-age ${KEEP_DAYS}d r2:sapphire-backups/sapphire/db/      2>/dev/null || true
  rclone delete --min-age ${KEEP_DAYS}d r2:sapphire-backups/sapphire/hr/data/ 2>/dev/null || true
  rclone delete --min-age ${KEEP_DAYS}d r2:sapphire-backups/sapphire/system/  2>/dev/null || true
  rclone delete --min-age ${KEEP_DAYS}d r2:sapphire-backups/sapphire/env/     2>/dev/null || true
  echo "[offsite] Pushed to R2"
else
  echo "[offsite] (R2 push skipped -- no rclone remote called \"r2\" configured yet)"
fi

echo "[offsite] ── Done ────────────────────────────────────"
