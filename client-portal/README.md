# Sapphire Clinics East — Patient Portal

Standalone Next.js app deployed at **https://client.sapphireclinicseast.org**.

Lets patients:
- Log in (email + last name) or self-register as a new patient
- Browse available therapist slots filtered by branch + service
- Request an appointment (goes to the Decking Module front-desk queue)
- Pay the downpayment via PayMongo after front-desk approval
- See teletherapy links once payment is received

## Architecture

- Runs on port **3001** on the VPS; nginx proxies `client.sapphireclinicseast.org → 127.0.0.1:3001`
- Does **not** talk to Postgres directly — all data access goes through
  `/api/public/*` on the marketing app via a same-origin proxy in
  `src/app/api/booking-proxy/[...path]/route.ts`
- Stores a short-lived HMAC-signed session token in `localStorage` (see
  `src/lib/session.ts`)

## Local dev

```bash
cd client-portal
npm install
MARKETING_URL=http://localhost:3000 npm run dev
# opens on http://localhost:3001
```

The marketing app must be running on `:3000` with the migration applied.

## Deploy

Build is handled by the Dockerfile; the service is wired into the marketing
app's `docker/docker-compose.yml`. See the top-level deploy runbook.
