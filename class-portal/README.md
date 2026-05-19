# Sapphire Clinics East — Class Portal

Standalone Next.js app deployed at **https://class.sapphireclinicseast.org**.

Lets parents/guardians:
- Register a new student or look up a returning student (by email + last name)
- Choose an enrollment level: Kindergarten or Grades 1–3
- Provide the PSA Birth Certificate number
- Upload the required documents (level-specific) and sign the Parent/Guardian Waiver
- The signed waiver is generated digitally from a signature pad or uploaded e-signature image

## Architecture

- Runs on container port **3000**, mapped to host **127.0.0.1:3006** by docker-compose; nginx proxies `class.sapphireclinicseast.org → 127.0.0.1:3006`.
- Multi-step draft state lives in `localStorage` (see `src/lib/session.ts`) so the flow survives navigation across `/`, `/enroll`, `/documents`, and the waiver popup.
- The waiver opens in a new window (`/waiver?level=…`); on sign, it writes `waiverSignedAt` back into the draft via `localStorage`, and the documents tab refreshes the indicator when it regains focus.
- The student/enrollment endpoints aren't built on the marketing app yet — `src/lib/api.ts` ships stubs (`registerStudent`, `lookupStudent`, `submitDocuments`) that can be swapped for real `/api/public/students/*` calls without changing any page components.

## Local dev

```bash
cd class-portal
npm install
MARKETING_URL=http://localhost:3000 npm run dev
# opens on http://localhost:3006
```

## Deploy

Build is handled by the Dockerfile; the service is wired into the marketing app's `docker/docker-compose.yml` as `class-portal`. See `DEPLOY.md`.
