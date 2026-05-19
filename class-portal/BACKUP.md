# class-portal weekly Drive backup

The repo lives in GitHub (primary backup). On top of that, the VPS pushes a
date-stamped tarball of `class-portal/` to Google Drive
`main@sapphireclinicseast.org` once a week via `rclone`. This document is the
one-time setup runbook.

## On the VPS (root)

```bash
# 1. Install rclone if not present
apt update && apt install -y rclone

# 2. Interactive Drive auth — only needed once.
rclone config
#   n) new remote
#   name>           scei_drive
#   storage>        drive
#   client_id>      (blank — uses rclone's default)
#   client_secret>  (blank)
#   scope>          1   (full access to all files)
#   service_account_file>  (blank)
#   Edit advanced config>  n
#   Use auto config>       n   (we're on a headless VPS)
# Follow the printed URL on any laptop, sign in as
# main@sapphireclinicseast.org, paste the verification code back into rclone.
#   Configure as a team drive>  n
#   y) yes this is OK

# 3. Make sure the target folder exists
rclone mkdir scei_drive:/SCEI-Backups/class-portal

# 4. Smoke-test the backup script
chmod +x /opt/sapphire/class-portal/scripts/backup.sh
/opt/sapphire/class-portal/scripts/backup.sh

# 5. Schedule weekly (every Monday 03:15 UTC)
cat > /etc/cron.d/sapphire-class-portal-backup <<'EOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
15 3 * * 1 root /opt/sapphire/class-portal/scripts/backup.sh >> /var/log/sapphire-class-portal-backup.log 2>&1
EOF
```

## Restoring from a backup

Backups land in `Google Drive ▸ SCEI-Backups ▸ class-portal/`.
Each is a `class-portal-YYYYMMDDTHHMMSSZ.tar.gz`. To restore:

```bash
tar xzf class-portal-YYYYMMDDTHHMMSSZ.tar.gz   # → class-portal/
```

User accounts created via `/admin` are NOT in the backup (they live in
browser `localStorage` for now). Once student/teacher records move to
Postgres, extend `backup.sh` to also `pg_dump` the relevant tables.

## Retention

The script prunes archives older than 60 days from Drive. Adjust the
`--min-age 60d` flag in `backup.sh` if you want a different retention window.
