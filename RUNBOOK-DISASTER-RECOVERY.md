# SCEI Disaster Recovery Runbook

This document is the procedure to follow when something has gone wrong with
the production VPS or its data. Read it cold — it assumes the reader has
SSH access and basic shell familiarity, but no specific knowledge of how
the apps were built.

If you are **adding** a feature, this is not the right document. See the
ordinary deploy.sh scripts in each app folder.

---

## Contents

1. [Who you are](#who-you-are)
2. [What's running where](#whats-running-where)
3. [What's backed up where](#whats-backed-up-where)
4. [The single secret you must have](#the-single-secret-you-must-have)
5. [Triage by symptom](#triage-by-symptom)
6. [Common procedures](#common-procedures)
7. [Full disaster recovery](#full-disaster-recovery-vps-is-gone)
8. [Verification & smoke tests](#verification--smoke-tests)
9. [Cron / alert reference](#cron--alert-reference)

---

## Who you are

You can sign in as the SSH key holder for `root@152.53.231.249`. The same
key is configured as a deploy key on the GitHub repo. You also have
`main@sapphireclinicseast.org` Google Workspace credentials (or can recover
that account through Google's normal flow).

If neither of those is true, stop and find someone who has them. There is
no recovery path that bypasses both the SSH key and the Google account.

---

## What's running where

| Service | Domain | Where it runs | Code repo path |
|---|---|---|---|
| Marketing hub | marketing.sapphireclinicseast.org | Docker on VPS, port 3000 | `sapphireclinicseast.org/` |
| Teletherapy | teletherapy.sapphireclinicseast.org | PM2 on VPS, port 3002 | `teletherapy/` |
| Accounting | accounting.sapphireclinicseast.org | Docker on VPS, port 3001 | `accounting-hub/` |
| HR platform | hr.sapphireclinicseast.org | PM2 on VPS, port 3457 | (VPS only, not in this repo) |
| Verdana store | verdana.sapphireclinicseast.org | PM2 on VPS, port 3010 | `verdana-store/` |
| Postgres (sapphire_marketing) | — | Docker `sapphire_db` | — |
| Postgres (sapphire_accounting) | — | Docker `accounting_db` | — |

Public SSH: `ssh root@152.53.231.249`. nginx reverse-proxies all the
public domains and terminates TLS via Let's Encrypt (auto-renewed by
certbot).

---

## What's backed up where

Every off-site backup is **encrypted at rest**. The same passphrase
decrypts both off-site copies. See [The single secret](#the-single-secret-you-must-have).

| Destination | Cadence | Retention | Lives where |
|---|---|---|---|
| Hourly local source tarballs (teletherapy) | hourly :05 | 7 days × 24 = 168 | `/var/backups/teletherapy/` on VPS |
| Golden snapshot (teletherapy auto-heal) | hourly + per-minute checks | always-current | `/var/lib/teletherapy-golden/` on VPS |
| **Golden snapshot (accounting auto-heal)** | hourly :10 + per-minute checks | always-current | `/var/lib/accounting-golden/` on VPS |
| **Golden snapshot (HR auto-heal)** | hourly :10 + per-minute checks | always-current | `/var/lib/hr-golden/` on VPS |
| Nightly local DB + uploads + source (sapphire) | 02:00 UTC daily | 30 days | `/opt/sapphire/backups/` on VPS |
| Nightly accounting DB | 02:00 UTC + pre-deploy | ~14 days | `/opt/backups/accounting_db/` on VPS |
| Nightly HR backup | 02:00 UTC daily | 30 days | `/opt/backups/scei-hr/` on VPS |
| **GitHub off-site (encrypted)** | 03:30 UTC daily | 90 days | branch `backups-encrypted` of `sapphireclinicseast/sapphire-clinics-east` |
| **Google Drive off-site (encrypted)** | 04:00 UTC daily | 90 days | `main@sapphireclinicseast.org` → `SCEI-Backups-Encrypted/` |

Each off-site contains the same five buckets:
`sapphire-db/`, `sapphire-uploads/`, `accounting-db/`, `hr/`,
`teletherapy-src/`.

### Auto-heal coverage

Three apps run a per-minute "source-guard" cron that detects regressions
(missing files, missing env keys, content fingerprints absent from
key files) and self-heals from the local golden snapshot before users
notice:

- **teletherapy** → `/usr/local/bin/teletherapy-source-guard.sh`
- **accounting** → `/usr/local/bin/scei-accounting-source-guard.sh` (rebuilds via `docker compose up -d --force-recreate`)
- **hr** → `/usr/local/bin/scei-hr-source-guard.sh` (restarts via `pm2 restart hr-platform`)

Each fires an email alert when it triggers a recovery so you know
something hit them.

### Verification

A weekly automated **restore drill** runs every Sunday 07:00 UTC
(`/usr/local/bin/scei-restore-drill.sh`):

1. Spins up a throwaway Postgres container.
2. Pulls the newest GitHub off-site backup, decrypts it, imports both
   sapphire and accounting dumps.
3. Counts rows in known tables (`Patient`, `Staff`, `Schedule`,
   `Consultant`, `PayrollEntry`, `Order`, etc.).
4. Pulls the newest Google Drive backup, verifies it decrypts and
   passes a gzip integrity test.
5. Tears down the container.
6. Emails a pass/fail summary — **always**, including on success, so a
   missing weekly email is itself a signal.

---

## The single secret you must have

`/root/.scei-backup-passphrase` on the VPS — a 65-character string. It
encrypts both off-site copies. **Without it, the backups are
mathematically uncrackable, including by you.**

Save it in:

1. **Password manager** (1Password / Bitwarden / Apple Passwords) of the
   primary admin.
2. **Printed copy in a physical safe** (clinic safe / safe-deposit box).
3. **NOT in any chat log, email, or unencrypted file.**

To copy it from the VPS:

```bash
ssh root@152.53.231.249 'cat /root/.scei-backup-passphrase'
```

If you ever rotate it, immediately re-encrypt the existing off-site
backups OR accept that older off-site copies become unrecoverable.

---

## Triage by symptom

### "The site is showing 502 / Bad Gateway"

The PM2/Docker process is down or crashing. SSH in and:

```bash
ssh root@152.53.231.249
pm2 list                         # which process is offline?
pm2 logs scei-teletherapy --lines 100  # errors
docker ps -a                     # any stopped containers?
docker logs accounting_app --tail 100
```

Common causes:
- Build artifacts missing (`.next` wiped). Fix:
  `cd /var/www/.../teletherapy && npm ci && npx prisma generate && npm run build && pm2 restart scei-teletherapy --update-env`
- DB password drift. See [Fix Postgres auth drift](#fix-postgres-auth-drift).
- Disk full (`df -h /`). Prune `/var/backups/` if needed.

### "A teletherapy feature regressed (e.g. seminars page is gone)"

The source-guard auto-heals within 60 seconds. If it didn't:

```bash
sudo /usr/local/bin/teletherapy-source-guard.sh
tail -20 /var/log/teletherapy-source-guard.log
```

Manual restore:

```bash
rsync -a --delete /var/lib/teletherapy-golden/src/ \
  /var/www/sapphireclinicseast.org/teletherapy/src/
cd /var/www/sapphireclinicseast.org/teletherapy && npm run build
pm2 restart scei-teletherapy --update-env
```

### "A clinician's payslip / patient record / order is wrong"

App-level data issue, not a disaster. Pull a recent DB dump locally and
investigate:

```bash
scp root@152.53.231.249:/opt/sapphire/backups/sapphire_$(date +%Y%m%d)*.sql.gz .
gunzip sapphire_*.sql.gz
psql -d throwaway -f sapphire_*.sql
```

### "I got an alert email saying a backup failed"

Look at the named log on the VPS:

```bash
ssh root@152.53.231.249 'tail -80 /var/log/<log-from-email>'
```

If it's a transient network failure, the next run usually heals it.
If it persists for 2+ days, escalate.

### "I can't access the VPS at all"

The VPS host is unreachable, compromised, or terminated.
Go to [Full disaster recovery](#full-disaster-recovery-vps-is-gone).

---

## Common procedures

### Fix Postgres auth drift

`POSTGRES_PASSWORD` in env is only honored on first volume init. If env
is changed later, the actual stored password drifts. Symptom:

```
Authentication failed against the database server
```

Fix (accounting; same shape works for sapphire):

```bash
ssh root@152.53.231.249
ENV_PWD=$(docker exec accounting_app env | grep ^DATABASE_URL \
  | sed -E 's|.*sapphire:([^@]+)@.*|\1|')
docker exec accounting_db psql -U sapphire -d sapphire_accounting \
  -c "ALTER USER sapphire WITH PASSWORD '$ENV_PWD';"
docker restart accounting_app
```

### Decrypt one file from off-site backup

GitHub off-site (`.enc` blobs):

```bash
git clone -b backups-encrypted git@github.com:sapphireclinicseast/sapphire-clinics-east.git scei-backups
cd scei-backups
PASS=/path/to/passphrase   # the saved 65-char passphrase, in a file
# Single-blob file:
openssl enc -d -aes-256-cbc -pbkdf2 -pass file:$PASS \
  -in sources/sapphire-db/2026-05-05__sapphire_20260505_020001.sql.gz.enc \
  -out sapphire.sql.gz
# Chunked file (uploads tarball, etc.):
cat sources/sapphire-uploads/2026-05-05__*.enc.part-* > combined.enc
openssl enc -d -aes-256-cbc -pbkdf2 -pass file:$PASS \
  -in combined.enc -out sapphire-uploads.tar.gz
```

Google Drive off-site (rclone crypt):

```bash
# On a machine with rclone installed; needs the same passphrase.
PASS=$(cat /path/to/passphrase)
rclone --crypt-password "$(echo -n "$PASS" | rclone obscure -)" \
       --crypt-password2 "$(echo -n "${PASS}-salt" | rclone obscure -)" \
       --crypt-remote "gdrive:SCEI-Backups-Encrypted" \
       copy gdrive-crypt:sapphire-db/ /restore/
```

### Restore a Postgres dump

```bash
gunzip -c sapphire.sql.gz | docker exec -i sapphire_db \
  psql -U sapphire -d sapphire_marketing
```

For accounting:

```bash
gunzip -c accounting.sql.gz | docker exec -i accounting_db \
  psql -U sapphire -d sapphire_accounting
```

⚠️ This **overwrites** existing data. To restore non-destructively, restore
into a throwaway database first.

### Test backup integrity (quarterly drill)

```bash
ssh root@152.53.231.249

# 1. Verify GitHub off-site decryption
cd /var/lib/scei-backups-encrypted
NEWEST_DB=$(ls -1t sources/sapphire-db/*.enc | head -1)
openssl enc -d -aes-256-cbc -pbkdf2 \
  -pass file:/root/.scei-backup-passphrase \
  -in "$NEWEST_DB" -out /tmp/restore-test.sql.gz
gunzip -c /tmp/restore-test.sql.gz | head -3   # should print PG header
rm /tmp/restore-test.sql.gz

# 2. Verify Drive off-site decryption
rclone copy gdrive-crypt:sapphire-db/ /tmp/drive-test/ \
  --include "$(date +%Y)*"
ls -lh /tmp/drive-test/
rm -rf /tmp/drive-test

# 3. Spin up a throwaway Postgres and import
docker run --rm -d --name pg-restore-test -e POSTGRES_PASSWORD=test \
  -p 55432:5432 postgres:16-alpine
sleep 5
gunzip -c /opt/sapphire/backups/sapphire_*.sql.gz \
  | tail -1 | docker exec -i pg-restore-test psql -U postgres
docker exec pg-restore-test psql -U postgres -c '\dt'
docker stop pg-restore-test
```

---

## Full disaster recovery (VPS is gone)

Estimated time: **45 – 90 minutes** depending on connectivity.

### 1. Provision a new VPS

Same provider (or any) with at least 4 GB RAM, 80 GB disk, Ubuntu 22.04
or Debian 13. Note the new public IP.

### 2. Install base tools

```bash
ssh root@<new-ip>
apt update && apt install -y docker.io docker-compose-v2 nodejs npm git \
  rclone postgresql-client nginx certbot python3-certbot-nginx
npm install -g pm2
pm2 startup systemd -u root --hp /root
```

### 3. Pull the code repo

```bash
cd /var/www
mkdir -p sapphireclinicseast.org
cd sapphireclinicseast.org
git clone https://github.com/sapphireclinicseast/sapphire-clinics-east.git .
# Or the SSH form if you have a deploy key set up.
```

### 4. Restore secrets

You'll need to recreate (from your password manager / records):

- `/opt/sapphire/docker/.env.production` — DB passwords, NextAuth secret, Resend, Google OAuth, etc.
- `/opt/accounting/docker/.env` — POSTGRES_PASSWORD, TELETHERAPY_INTERNAL_API_KEY, etc.
- `teletherapy/.env` — DATABASE_URL, NEXTAUTH_SECRET, HR_API_KEY, ACCOUNTING_API_KEY, RESEND_API_KEY.
- `/root/.scei-backup-passphrase` — the 65-char encryption passphrase from your password manager.
- `/etc/scei/alerting.env` — Resend API key + recipients.
- `/root/.config/rclone/rclone.conf` — Drive auth (regenerate with the OAuth flow).

### 5. Restore data from off-site

Pick whichever off-site is fastest for you (GitHub or Drive).

#### Option A — from GitHub

```bash
cd /tmp
git clone -b backups-encrypted \
  git@github.com:sapphireclinicseast/sapphire-clinics-east.git scei-backups
cd scei-backups
PASS=/root/.scei-backup-passphrase  # already on disk after step 4

mkdir -p /restore
# Sapphire DB
openssl enc -d -aes-256-cbc -pbkdf2 -pass file:$PASS \
  -in sources/sapphire-db/$(ls -1t sources/sapphire-db/ | head -1) \
  -out /restore/sapphire.sql.gz
# Sapphire uploads (chunked)
cat sources/sapphire-uploads/$(ls -1t sources/sapphire-uploads/ | head -1 | sed 's/.part-.*//').part-* \
  > /tmp/uploads.enc
openssl enc -d -aes-256-cbc -pbkdf2 -pass file:$PASS \
  -in /tmp/uploads.enc -out /restore/sapphire-uploads.tar.gz
# Accounting DB
openssl enc -d -aes-256-cbc -pbkdf2 -pass file:$PASS \
  -in sources/accounting-db/$(ls -1t sources/accounting-db/ | head -1) \
  -out /restore/accounting.sql.gz
```

#### Option B — from Google Drive

```bash
# After step 4 leaves rclone configured:
rclone copy gdrive-crypt:/ /restore/ --include "$(date +%Y-%m-%d)*"
ls -lh /restore/
```

### 6. Bring up Postgres and load dumps

Sapphire (marketing + teletherapy share this DB):

```bash
cd /opt/sapphire/docker
docker compose up -d postgres
sleep 10
gunzip -c /restore/sapphire.sql.gz \
  | docker exec -i sapphire_db psql -U sapphire -d sapphire_marketing
```

Accounting:

```bash
cd /opt/accounting/docker
docker compose up -d postgres
sleep 10
gunzip -c /restore/accounting.sql.gz \
  | docker exec -i accounting_db psql -U sapphire -d sapphire_accounting
```

### 7. Restore uploads

```bash
mkdir -p /opt/sapphire
tar xzf /restore/sapphire-uploads.tar.gz -C /opt/sapphire/
```

### 8. Bring up apps

```bash
# Marketing hub
cd /opt/sapphire/docker && docker compose up -d
# Accounting
cd /opt/accounting/docker && docker compose up -d
# Teletherapy
cd /var/www/sapphireclinicseast.org/teletherapy
npm ci && npx prisma generate && npm run build
pm2 start npm --name scei-teletherapy -- start
pm2 save
# (Repeat similar pattern for verdana-store, hr-platform, etc.)
```

### 9. Update DNS

Point each `*.sapphireclinicseast.org` A record at the new IP. nginx will
serve cached responses until certbot regenerates certs (next step).

### 10. Issue TLS certificates

```bash
# Copy /etc/nginx/sites-enabled/* from the old config (in the repo or
# from the most recent source-tarball backup). Then:
certbot --nginx -d teletherapy.sapphireclinicseast.org \
                 -d marketing.sapphireclinicseast.org \
                 -d accounting.sapphireclinicseast.org \
                 -d hr.sapphireclinicseast.org
nginx -t && systemctl reload nginx
```

### 11. Reinstall the protective daemons

```bash
# Source-guard for teletherapy
# (script source is in this runbook's repo / commit history;
# recreate from /usr/local/bin/teletherapy-source-guard.sh in the
# most recent source-tarball backup)
crontab -e
# Add:
#   * * * * * /usr/local/bin/teletherapy-source-guard.sh
#   5 * * * * /usr/local/bin/teletherapy-backup.sh
#   30 3 * * * /usr/local/bin/scei-offsite-encrypted-backup.sh
#   0 4 * * * /usr/local/bin/scei-gdrive-backup.sh
#   0 6 * * * /usr/local/bin/scei-backup-healthcheck.sh
```

Take the first golden snapshot:

```bash
mkdir -p /var/lib/teletherapy-golden
rsync -a --delete /var/www/sapphireclinicseast.org/teletherapy/src/ \
                  /var/lib/teletherapy-golden/src/
cp /var/www/sapphireclinicseast.org/teletherapy/.env \
   /var/lib/teletherapy-golden/.env
chmod 600 /var/lib/teletherapy-golden/.env
```

### 12. Verify

See [Verification & smoke tests](#verification--smoke-tests).

---

## Verification & smoke tests

After any restore or deploy, confirm:

```bash
# All apps return 200 for their health-equivalent
for url in \
  https://teletherapy.sapphireclinicseast.org/login \
  https://accounting.sapphireclinicseast.org/login \
  https://marketing.sapphireclinicseast.org/ \
  https://hr.sapphireclinicseast.org/login.html ; do
  curl -s -o /dev/null -w "%{http_code} $url\n" "$url"
done

# Postgres reachable from app side
docker exec sapphire_app sh -c \
  'echo "SELECT count(*) FROM \"Patient\";" | psql $DATABASE_URL'
docker exec accounting_app sh -c \
  'echo "SELECT count(*) FROM \"PayrollEntry\";" | psql $DATABASE_URL'

# PM2 processes are online
pm2 list

# Source-guard is active
crontab -l | grep teletherapy-source-guard
tail -3 /var/log/teletherapy-source-guard.log
```

After a disaster recovery: **send yourself a test alert** to confirm
alerting still works:

```bash
/usr/local/bin/scei-alert.sh "[SCEI] Recovery complete" \
  "VPS rebuilt at $(date -u +%Y-%m-%dT%H:%M:%SZ). Sanity check confirmed."
```

---

## Cron / alert reference

Look at the live crontab to see exactly what's scheduled:

```bash
ssh root@152.53.231.249 'crontab -l'
```

The shape of every entry is:

```
<schedule> <command> >> <log> 2>&1 || /usr/local/bin/scei-alert.sh "subject" "$(tail -50 <log>)"
```

So failures email `ALERT_RECIPIENTS` from `/etc/scei/alerting.env`.

Daily healthcheck (`/usr/local/bin/scei-backup-healthcheck.sh`) runs at
06:00 UTC and emails a consolidated summary if **any** backup
destination is older than 26 hours, the PM2 process is down, or disk
usage is over 85%.

To **mute alerting temporarily** (during a planned maintenance window):

```bash
mv /etc/scei/alerting.env /etc/scei/alerting.env.muted
# Do work...
mv /etc/scei/alerting.env.muted /etc/scei/alerting.env
```

Muted state means `scei-alert.sh` will fail with a "no such file" error,
which is silent (it goes to stderr that nothing reads).

---

*Last updated: 2026-05-05. Update this file when adding new services,
backup destinations, or recovery procedures.*
