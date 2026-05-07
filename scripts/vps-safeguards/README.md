# VPS-side safeguards

These scripts live at `/usr/local/bin/` on the production VPS and are wired
to root's crontab. They're kept here for version control so a future VPS
rebuild can re-install them. **Editing these files in this directory does
NOT push to the VPS — they need to be SCP'd manually**:

```
scp scripts/vps-safeguards/scei-*.sh root@152.53.231.249:/usr/local/bin/
ssh root@152.53.231.249 'chmod +x /usr/local/bin/scei-*.sh'
```

## Cron entries (in root's crontab on the VPS)

```cron
# Verify the marketing-hub container can reach HR Platform every 5 min.
# Alerts after 3 consecutive failures (15 min of HR being unreachable).
*/5 * * * * /usr/local/bin/scei-hr-connectivity-check.sh

# Detect drift between the multiple .env.production files every hour at :20.
20 * * * * /usr/local/bin/scei-env-divergence-check.sh
```

## What each catches

**`scei-hr-connectivity-check.sh`** — runs a full fetch from inside the
`sapphire_app` container against `$HR_PLATFORM_URL/forms/external/<sentinel>/responses`.
Exercises the same network path as the real application. Catches:
- Container env-var misconfiguration (e.g. `127.0.0.1` vs `host.docker.internal`)
- Missing `extra_hosts` mapping in docker-compose.yml
- Bearer-token mismatch
- HR Platform process crashed or unresponsive

**`scei-env-divergence-check.sh`** — compares the canonical
`/opt/sapphire/docker/.env.production` (used by the GH Actions deploy)
against shadow files at `/opt/sapphire-marketing-hub/docker/.env.production`
and `/var/www/sapphireclinicseast.org/docker/.env.production`. Compares
critical keys: `HR_PLATFORM_URL`, `DATABASE_URL`, `NEXTAUTH_SECRET`,
`HR_PLATFORM_API_KEY`, etc. Alerts if any drift.

Both scripts use the existing `/usr/local/bin/scei-alert.sh` for
notifications and write per-script logs to `/var/log/`.
