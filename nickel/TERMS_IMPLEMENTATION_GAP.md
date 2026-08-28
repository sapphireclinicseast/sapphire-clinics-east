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

### Money — the biggest gap
- ❌ **Platform Fee 15%** computation (Terms §10.3, Annex A1) — app charges the client the full
  Provider Rate; nothing computes/retains the 15%.
- ❌ **Payout engine** (Annex A2–A3): weekly runs, net computation, minimum-balance rollover,
  payout **statements**, set-off (Terms §10.6), 50% set-off cap (A8.4). Payouts are entirely manual.
- ❌ **Creditable withholding tax** 5%/10% + **BIR Form 2307** issuance (Annex A2.4, Terms §10.5).
- ❌ **BIR/tax capture**: TIN, BIR Certificate of Registration, annual sworn declaration (Annex A2.4, C2).
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
- ❌ **Cancellation / reschedule / no-show** flow with time-band refunds (Annex A4–A6).
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
- ⚠️ App collects PRC/PTR as **text only**. ❌ No document uploads (PRC card, PTR, gov-ID, CV,
  **NBI clearance**), ❌ no verification workflow, ❌ no annual re-verification, ❌ no continuing
  duty-to-notify capture (§3.3–3.5).
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
