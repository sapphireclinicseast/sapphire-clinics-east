# Deploy runbook — `class.sapphireclinicseast.org`

One-time setup and redeploy steps for the class (student enrollment) portal on the VPS (152.53.231.249).

## One-time (first deploy)

### 1. DNS
`class.sapphireclinicseast.org` A record → `152.53.231.249` (already done).

### 2. SSL cert
SSH to VPS, then from the directory containing `docker-compose.yml`:
```bash
sudo certbot certonly --webroot -w /var/www/certbot -d class.sapphireclinicseast.org
```

### 3. Build + start
```bash
cd /opt/sapphire
git pull
docker compose -f docker/docker-compose.yml up -d --build class-portal
# reload nginx (container or host — depends on your setup) so the new
# class.sapphireclinicseast.org server block is picked up
```

## Redeploys
```bash
cd /opt/sapphire
git pull
docker compose -f docker/docker-compose.yml up -d --build class-portal
```

## Smoke test after deploy
1. Open `https://class.sapphireclinicseast.org` in incognito.
2. New student tab → fill the form → pick an enrollment level → Create profile & continue.
3. Enter a sample PSA Birth Certificate No. → Continue to documents.
4. Upload required docs for that level → Click "Open waiver →" → draw or upload signature → Sign.
5. Back on the documents tab, the waiver row turns green → Submit enrollment.

## Rollback
```bash
git checkout <previous-sha>
docker compose -f docker/docker-compose.yml up -d --build class-portal
```
