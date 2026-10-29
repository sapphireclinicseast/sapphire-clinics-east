# How to edit and run the SCEI ERP without Claude (or any AI)

Written 2026-10-29 for whoever maintains these systems next: Hannah, a hired
developer, or an IT contractor. Nothing here needs an AI tool. Everything is
ordinary, widely known technology: TypeScript, Next.js, Node.js, Postgres,
Docker, nginx, GitHub. Any web developer who has built a Next.js app can do
all of this; the "Tell a developer" lines are what to hand them.

---

## 1. What the ERP is made of

| Website | What it is | Code lives in | Runs on the server as |
|---|---|---|---|
| accounting.sapphireclinicseast.org | Accounting hub | `accounting-hub/` | Docker `accounting_app`, port 3001 |
| staff.sapphireclinicseast.org | Staff portal ("teletherapy") | `teletherapy/` | PM2 `scei-teletherapy`, port 3002 |
| operations / schedules .sapphireclinicseast.org | Operations hub | repo root `src/` | Docker `sapphire_app`, port 3000 |
| class.sapphireclinicseast.org | Class portal | `class-portal/` | Docker `sapphire_class_portal`, 3006 |
| client.sapphireclinicseast.org | Client portal | `client-portal/` | Docker `sapphire_client_portal`, 3005 |
| hr / templates .sapphireclinicseast.org | HR platform | separate repo `scei-hr-platform` | PM2 `hr-platform`, port 3457 |
| verdanarehab.com | Verdana store | `verdana-store/` | PM2 `verdana-store`, port 3010 |

Two GitHub repositories (account **sapphireclinicseast**):
`sapphire-clinics-east` (everything above except HR) and `scei-hr-platform`.

Databases: `sapphire_accounting` (Postgres, for accounting) and
`sapphire_marketing` (Postgres, for operations, schedules, staff, class and
client portals). HR uses an SQLite file `api/data/hr.db` plus JSON files.

Server: one Netcup VPS, `ssh root@152.53.231.249`. nginx in front, TLS by
Let's Encrypt (auto-renews). Full rebuild instructions are in
`RUNBOOK-DISASTER-RECOVERY.md` beside this file.

## 2. What you need on a computer to edit the code

1. **Node.js 20** from https://nodejs.org (the LTS download). Postgres 16
   only if you want to run the accounting or operations apps locally against
   real data; for most UI edits you don't.
2. **Git** (comes with Xcode command-line tools on a Mac: run `xcode-select --install`).
3. **A code editor.** VS Code (free) is the usual choice.
4. **The code.** Either `git clone https://github.com/sapphireclinicseast/sapphire-clinics-east.git`
   (sign in with the company GitHub account) or unpack
   `01-source-code/sapphire-clinics-east__monorepo-live-tree.tar.gz` from the
   offline kit. The kit also has the full git history as a `.bundle` file:
   `git clone sapphire-clinics-east__git-main-full-history.bundle scei`.
5. **Secrets.** Each app reads a `.env` file that is NOT in git (passwords,
   API keys). They live on the server (`/opt/accounting/docker/.env`,
   `/opt/sapphire/docker/.env.production`, `teletherapy/.env`, HR's `.env`)
   and in the SECRETS tarball you added to the kit. To run an app locally,
   copy its `.env.example` to `.env.local` and fill in what you need.

Tell a developer: "Next.js 16 / TypeScript monorepo, Node 20, Prisma ORM on
Postgres 16. Each folder is its own app with its own package.json."

## 3. Making a change (the everyday loop)

```bash
cd ~/scei-sapphire-crm/accounting-hub     # or teletherapy, class-portal, ...
npm ci                                    # install dependencies (first time, or after package.json changes)
npm run dev                               # starts the app at http://localhost:3000 (teletherapy :3002, class :3006, client :3001, nickel :3007, verdana :3003)
```
Edit files under `src/` and the browser reloads by itself. Pages are in
`src/app/(dashboard)/<module>/page.tsx`; server endpoints are in
`src/app/api/<module>/route.ts`; the database shape is `prisma/schema.prisma`.

Before you publish, run these two checks in the app folder (both must pass):
```bash
npx tsc --noEmit -p tsconfig.json          # type errors
```
and from the repository root:
```bash
npm run lint:hooks                         # the React hooks rule — a failure here would crash a page in production
```

## 4. Publishing a change (deploy)

Normal path, no server login needed:
```bash
git add <files you changed>
git commit -m "accounting: what you changed and why"
git push origin main
```
Pushing to `main` starts the GitHub Actions workflow "Deploy to Netcup VPS"
(`.github/workflows/deploy.yml`). It lints, copies the code to the server,
rebuilds each app and restarts it. Watch it at
https://github.com/sapphireclinicseast/sapphire-clinics-east/actions ; about
25–40 minutes; a red run means nothing was switched over for the failed app,
the previous version keeps running. The HR repo has the same kind of
workflow.

Rules that bite if forgotten:
- **Accounting hub and staff portal must build with `next build --webpack`**
  (already in their package.json). Turbopack builds fail in Docker.
- **Database columns are NOT created automatically.** If you add a field to
  `prisma/schema.prisma`, you must also run the matching
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` on the server database by
  hand *before* the deploy finishes, and add the same line to
  `accounting-hub/docker/redeploy.sh` (the block of ALTER TABLE lines near the
  end) so a rebuild carries it. How to run SQL on the server:
  ```bash
  ssh root@152.53.231.249
  docker exec -it accounting_db psql -U sapphire -d sapphire_accounting
  ```
  (for operations/portals: `docker exec -it sapphire_db psql -U sapphire -d sapphire_marketing`)
- **Secrets are hand-maintained on the server.** A new environment variable
  must be added to the server's `.env` file yourself; the deploy never writes it.
- **Never full-clone the repo with all branches**: it is ~60 GB because of
  old encrypted backup branches. `git clone` of `main` only (the default) is fine.

Emergency manual deploy (only if GitHub is unavailable):
- Accounting: copy the `accounting-hub` folder to the server's `/opt/accounting`
  with rsync, then `cd /opt/accounting/docker && ./redeploy.sh` (it backs up
  the database and source first, then rebuilds the container).
- Staff portal: `cd teletherapy && ./deploy.sh` from your computer (it rsyncs
  and rebuilds; `--force` overrides its stale-source guard).
- Operations/portals: rsync to `/opt/sapphire`, then
  `cd /opt/sapphire/docker && docker compose up -d --build <service>`.
Never mix a manual deploy and a GitHub deploy for the same change.

## 5. Undoing a bad change

```bash
git revert <commit-sha>      # makes a new commit that undoes it
git push origin main         # deploys the undo
```
If a page shows "Page failed to load" after a deploy, that is almost always a
React error on that one page; revert first, investigate second.

## 6. Backups and restore (short version; full steps in the runbook)

- Every 15 minutes: both Postgres databases dumped on the server (7 days kept).
- Nightly 02:00: full dumps, uploads, source snapshots, HR backup (30 days).
- Daily 04:00: all of it encrypted to Google Drive of
  main@sapphireclinicseast.org (`SCEI-Backups-Encrypted`, 90 days).
  Decrypting needs the passphrase in `/root/.scei-backup-passphrase`
  (also in the SECRETS tarball). Without it the Drive copies are unreadable.
- Weekly Sunday: an automatic restore drill emails pass/fail. No email = investigate.
- Offline kit: `/opt/offline-bundle/` on the server (8.3 GB, everything) and
  the `SCEI-ERP-OFFLINE-BACKUP` folder on the hard drive / Mac. Refresh it with
  `copy-to-hard-drive.sh /Volumes/<drive>` after big changes.

Restore a database dump:
```bash
gunzip -c sapphire_accounting_<date>.sql.gz | docker exec -i accounting_db psql -U sapphire -d sapphire_accounting
```
(This overwrites; test into a throwaway database first — the runbook shows how.)

## 7. Where things are, when you are lost

- Business rules and how each module is meant to work: the in-app Handbook
  (accounting.sapphireclinicseast.org/handbook) and the Word copy in the kit.
- Which subdomain is which: `04-server-config/nginx/` in the kit, or
  `/etc/nginx/sites-enabled/` on the server.
- Scheduled jobs on the server: `crontab -l` as root (copy in the kit).
- Running processes: `pm2 list` and `docker ps` on the server.
- Logs: `docker logs accounting_app --tail 200`, `pm2 logs scei-teletherapy`,
  `/var/log/nginx/accounting.access.log`.

## 8. If you hire someone

Give them: read access to the two GitHub repos, the SECRETS tarball (or just
the `.env` for the app they touch), this file, the runbook, and the handbook.
Do not give the backup passphrase or root SSH to anyone you would not trust
with the bank accounts. A competent Next.js developer needs no other
hand-holding; everything above is standard practice.
