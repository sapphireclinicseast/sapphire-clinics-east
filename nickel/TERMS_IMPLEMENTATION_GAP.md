# Nickel — Terms/Annexes vs. Implementation Gap

**Purpose:** The Provider Terms of Service (`src/lib/provider-terms.tsx`) and Annexes A–D
(`src/lib/provider-annexes.tsx`) describe mechanisms the app **promises** to providers and
clients. Several are not built yet. This file maps each promised mechanism → clause → status,
so we flag the gap whenever we build a related feature. Keep it updated as things ship.

Status key: ✅ implemented · ⚠️ partial · ❌ not implemented (policy published, code absent)

_Last reviewed: 2026-08-28_

---

## Already implemented (baseline)
- ✅ Provider self-signup + login + session (Terms §18, §24.3 partial)
- ✅ Provider portal: weekly availability slots, patients list, settings (rate, transpo-inclusive
  toggle, PRC/PTR text, e-signature, bank + GCash), tickets, profile (Terms §4.2, §3.1 partial)
- ✅ Patient signup/login, city selection, browse providers by city + open slots, book a 1-hr slot
- ✅ Client payment collected online via SCEI **Verdana** PayMongo account (Terms §10.1)
- ✅ Booking marked PAID via PayMongo webhook

---

## ❌ / ⚠️ Not (fully) implemented — flag when building nearby

### Money
- ✅ **15% fee / 5% CWT / net split SHIPPED** (2026-08-28): recorded per booking when paid
  (`src/lib/earnings.ts`, PayMongo webhook), shown on the provider **Settlements** tab (weekly grouping)
  and the admin **Payouts** run. `Payout` model batches a provider's unpaid sessions; admin "Mark paid"
  closes the ledger. Disbursement is **manual** (finance transfers, then marks paid) — PayMongo can't
  auto-pay providers; auto-disbursement (Xendit/GCash) is a later add.
- ⚠️ CWT is a **flat 5%** — the 10% branch (no sworn declaration / >₱3M) isn't modelled yet; no
  per-provider tax status tracked.
- ❌ **BIR Form 2307** generation (Annex A2.4, Terms §10.5) — statement says it's issued; not built.
- ❌ **BIR/tax capture**: TIN, BIR Certificate of Registration, annual sworn declaration (Annex A2.4, C2).
- ❌ **Weekly auto-run + minimum-balance rollover + set-off / 50% cap** (Annex A3/A8.4) — payouts are
  triggered manually per provider, not a scheduled batch; no set-off logic.
- ❌ **Refunds / chargebacks** flow and allocation (Annex A8, Terms §11).

### Transportation (Annex D)
- ❌ **Distance-tier transportation** (D2.2, Tiers 1–5) — app only has a transpo-inclusive boolean;
  no road-distance calc, no tier allowance, no pass-through line on the Session Fee.
- ❌ **Home base** (barangay/city) for distance measurement (D1.2); app stores only `citiesCovered`.
- ❌ Tolls/parking reimbursement (D2.4); consecutive-booking distance logic (D2.6);
  Tier 4/5 quote + pre-approval + accommodation (D3).

### Bookings model
- ⚠️ **Offer/accept vs direct-book** (Terms §5.1–5.2): Terms describe SCEI *offering* a Booking that
  the provider accepts/declines; app currently lets the patient **directly** book a provider's slot.
  Decide which model is canonical, then align docs or code.
- ✅ **Reschedule (propose-new-time) SHIPPED** (2026-08-28): provider proposes an open slot →
  patient accepts (moves + confirms) or keeps original (`/api/provider/propose-time`,
  `/api/patient/respond-proposal`). Confirm/decline also shipped.
- ✅ **In-app chat SHIPPED**: patient↔therapist messaging scoped to a booking, with photo/PDF
  attachments (`Message` model, `/api/messages`, `Chat` component, patient `/bookings`).
- ❌ **Cancellation time-band refunds + no-show** compensation logic (Annex A4–A6) — decline just
  cancels; automated refund tiers not built.
- ❌ **Reliability record**: 90-day rolling late-cancel/no-show counters + ranking effect (Annex A5).
- ❌ **Automated matching / ranking** by area, credentials, ratings, reliability (Annex C9).

### Safety & clinical (Terms §6–9, Annex B/C/D)
- ❌ **Check-in / check-out** at each visit + location capture for safety/verification (Terms §8.2,
  Annex C2.2); SMS fallback number (D4.1).
- ❌ **Session logging / clinical notes** with templates, arrival/departure timestamps,
  addendum-only edits (Terms §5.9, §9.1); record **retention** (§9.3, Annex C6).
- ❌ **Informed consent** capture (Terms §6.3).
- ❌ **Minors: adult-presence attestation + guardian consent** (Terms §7.2–7.3); safeguarding
  report flow (§7.5).
- ❌ **Incident reporting** in-platform (Terms §8.4).

### Credentialing (Terms §3)
- ⚠️ **Verification flow SHIPPED** (2026-08-28): `/provider/verify` collects face scan, PRC-holding
  photo, PRC number, school + year graduated, diploma + TOR scans, and bank payout details; sets
  `verificationStatus=PENDING`; portal is gated (`(portal)/layout.tsx` redirects non-VERIFIED to
  /provider/verify); patients only see VERIFIED providers (`/api/providers`, `/api/cities`, `/api/book`).
- ✅ **Admin review console SHIPPED** (2026-08-28): `/admin/login` (email+password, env creds),
  `/admin` approval queue, `/admin/[id]` document-review screen with approve / reject (reason) /
  **"Allow specialized rate"** toggle. Verify flow now also collects years-of-experience, postgraduate,
  post-nominals, certifications, and a specialization + specialized-rate request.
- ❌ Still not collected vs Terms §3.3: **NBI clearance**, PTR *document*, government-ID, CV;
  ❌ no annual re-verification, ❌ no continuing duty-to-notify capture (§3.4–3.5).
- ⚠️ **Insurance** now *encouraged not required* (§16.1) — no field to record cover if held.

### Profile / privacy display (Annex C5, C2)
- ⚠️ Client-facing profile shows name/photo/profession/rate. ❌ Missing: PRC licence *status*,
  ratings/reviews, service categories, languages, Service Areas.
- ❌ **Ratings & reviews** with moderation (Terms §19).
- ❌ **Emergency contact** capture (Annex D4.4).
- ❌ **Data-subject request** handling / DPO workflow (Terms §13.4, Annex C8).

### Redress & records
- ⚠️ **Redress mechanism** (Terms §11, RA 11967): provider tickets exist; ❌ no client-facing
  booking-linked dispute/redress flow.
- ⚠️ **Terms acceptance record** (Terms §24.3): stores `termsVersion` + `termsAcceptedAt`;
  ❌ no device/IP/network identifiers, ❌ no per-version archive.

---

## Documentary blanks still to fill (shown as amber `[ — ]` in the rendered Terms/Annexes)
- Transport **Tier 1–3 allowances** (D2.2), tolls/parking cap (D2.4), SMS fallback number (D4.1),
  **hosting location / cloud region** (C4.2, from Jara).
