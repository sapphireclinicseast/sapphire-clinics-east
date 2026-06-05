# Deploy runbook — `client.sapphireclinicseast.org`

One-time setup and redeploy steps for the patient portal on the VPS (152.53.231.249).

## One-time (first deploy)

### 1. DNS
`client.sapphireclinicseast.org` A record → `152.53.231.249` (already done).

### 2. SSL cert
SSH to VPS, then from the directory containing `docker-compose.yml`:
```bash
sudo certbot certonly --webroot -w /var/www/certbot -d client.sapphireclinicseast.org
```

### 3. Env vars
Add these to the `.env` file on the VPS (usually `/opt/sapphire/.env`):
```
# PayMongo — LIVE keys (rotate the ones that were pasted in chat)
PAYMONGO_SECRET_KEY=sk_live_...
PAYMONGO_PUBLIC_KEY=pk_live_...
PAYMONGO_WEBHOOK_SECRET=<set after step 5 below>

# Patient portal HMAC secret (anything long & random)
PATIENT_PORTAL_SECRET=<openssl rand -hex 32>

MARKETING_URL=https://marketing.sapphireclinicseast.org
CLIENT_PORTAL_URL=https://client.sapphireclinicseast.org

# Sappy chatbot admin console (client.sapphireclinicseast.org/admin)
# SAPPY_ADMIN_PASSWORD — the password you type to log into the console.
# SAPPY_ADMIN_TOKEN     — shared secret the portal sends to the marketing app to
#                         authorize edits. Must be IDENTICAL in both services.
SAPPY_ADMIN_PASSWORD=<choose a strong password>
SAPPY_ADMIN_TOKEN=<openssl rand -hex 32>
```

`SAPPY_ADMIN_TOKEN` must also be present in the marketing `app` service's
environment (same value). Until both vars are set, `/admin` shows the login page
but logins are rejected with "Admin console is not configured on the server."

### 4. Build + start
```bash
cd /opt/sapphire
git pull
docker compose -f docker/docker-compose.yml up -d --build migrate
docker compose -f docker/docker-compose.yml up -d --build app client-portal
# reload nginx (container or host — depends on your setup)
```

### 5. PayMongo webhook
PayMongo Dashboard → Developers → Webhooks → Add endpoint:
- URL: `https://marketing.sapphireclinicseast.org/api/paymongo/webhook`
- Events: `link.payment.paid`
- Copy the webhook secret shown by PayMongo → paste into `.env` as `PAYMONGO_WEBHOOK_SECRET`
- Restart `app`: `docker compose -f docker/docker-compose.yml up -d --force-recreate app`

## Redeploys
```bash
cd /opt/sapphire
git pull
docker compose -f docker/docker-compose.yml up -d --build migrate  # only if schema changed
docker compose -f docker/docker-compose.yml up -d --build app client-portal
```

## Smoke test after deploy
1. Open `https://client.sapphireclinicseast.org` in incognito.
2. New patient tab → register → pick service + branch → pick a slot → submit.
3. Admin: `https://marketing.sapphireclinicseast.org/decking` → see pending request → Approve.
4. Check your email inbox for the approval email with "Pay Downpayment" button.
5. Click the button (or Pay Now in the portal) → complete PayMongo checkout with a real card.
6. Back in Decking Module, the row shows "💰 Paid Downpayment".

## Rollback
```bash
git checkout <previous-sha>
docker compose -f docker/docker-compose.yml up -d --build app client-portal
```
(Note: the booking migration is additive, so rolling back code without rolling back the DB is safe — the old code just won't see the new tables.)
