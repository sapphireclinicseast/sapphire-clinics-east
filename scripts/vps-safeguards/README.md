# VPS-side safeguards

These scripts live at `/usr/local/bin/` on the production VPS and are wired
to root's crontab. They're kept here for version control so a future VPS
rebuild can re-install them. **Editing these files in this directory does
NOT push to the VPS — they need to be SCP'd manually**:

```
scp scripts/vps-safeguards/scei-*.sh root@152.53.231.249:/usr/local/bin/
scp scripts/vps-safeguards/disk-alert.sh root@152.53.231.249:/usr/local/bin/
ssh root@152.53.231.249 'chmod +x /usr/local/bin/scei-*.sh /usr/local/bin/disk-alert.sh'
```

## Cron entries (in root's crontab on the VPS)

```cron
# Verify the marketing-hub container can reach HR Platform every 5 min.
*/5 * * * * /usr/local/bin/scei-hr-connectivity-check.sh

# Detect drift between the multiple .env.production files every hour.
20 * * * * /usr/local/bin/scei-env-divergence-check.sh

# Disk-usage alert every 5 min with WARN/HIGH/CRIT escalation + dedup.
*/5 * * * * /usr/local/bin/disk-alert.sh

# Weekly Docker prune to keep build-cache + dangling-image bloat bounded
# to a 7-day window. Prevents the May 2 / May 23 disk-fill class.
0 4 * * 0 /usr/local/bin/scei-docker-prune-weekly.sh
```

## What each script does

**`scei-hr-connectivity-check.sh`** — runs a full fetch from inside the
`sapphire_app` container against `$HR_PLATFORM_URL/forms/external/<sentinel>/responses`.
Exercises the same network path as the real application. Catches:
container env-var misconfiguration, missing `extra_hosts`, bearer-token
mismatch, HR Platform process crashed or unresponsive. Alerts after 3
consecutive failures (15 min outage).

**`scei-env-divergence-check.sh`** — compares the canonical
`/opt/sapphire/docker/.env.production` against shadow files on
`HR_PLATFORM_URL`, `HR_PLATFORM_API_KEY`, `DATABASE_URL`, `REDIS_URL`,
`NEXTAUTH_URL/SECRET`, `EXTERNAL_API_KEY`, `RESEND_API_KEY`. Alerts on
any drift.

**`disk-alert.sh`** — three-tier disk-usage escalation:
- `WARN` (>=90%) — alert once on threshold cross, suppress 6h
- `HIGH` (>=95%) — alert once on threshold cross, suppress 1h
- `CRIT` (>=98%) — alert every run (no suppression — postgres death imminent)

Tracks state in `/var/run/disk-alert.state`. Sends a "RECOVERED" alert when
disk drops back below WARN. Alerts route via `scei-alert.sh` → Resend.

**`scei-docker-prune-weekly.sh`** — Sunday 04:00 cleanup of Docker
artifacts older than 7 days (BuildKit cache, dangling images, stopped
containers, unused networks). Keeps the running image + last week of
build cache. Logs to `/var/log/docker-prune.log`. If disk is still >=90%
after prune, escalates via disk-alert.sh.

All scripts use `/usr/local/bin/scei-alert.sh` for notifications and write
per-script logs to `/var/log/`.

## Known gap

`scei-alert.sh` delivers via Resend. As of May 23, 2026 the Resend API
key is rejecting (401/403). Until a working key is restored in
`/etc/scei/alerting.env`, alerts will log locally but not actually
deliver. The dedup logic in each script still works regardless, so logs
stay readable.
