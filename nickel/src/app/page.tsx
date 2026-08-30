import HowItWorks from '@/components/HowItWorks'

const STEPS = [
  { n: '1', t: 'Tell us your city', d: 'We show therapists who serve your area.' },
  { n: '2', t: 'Pick your therapist', d: 'Every therapist is PRC-licensed and identity-verified. Choose by their open schedule and the cities they cover.' },
  { n: '3', t: 'Book & pay securely', d: 'Confirm a time and pay online — the therapist comes to you.' },
]

// Why patients choose Nickel (monochrome line icons).
const WHY_PATIENT = [
  { t: 'Care at home, on your schedule', d: 'A licensed therapist comes to you — no clinic queues, no travel. Book a time that fits your day.', icon: <><path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9Z" /><path d="M9 21v-7h6v7" /></> },
  { t: 'Verified, licensed professionals', d: 'Every therapist is PRC-licensed and identity-verified by us before they can appear — you know exactly who’s coming.', icon: <><path d="M12 3 4 6v6c0 4.5 3.4 7.9 8 9 4.6-1.1 8-4.5 8-9V6l-8-3Z" /><path d="M9 12l2 2 4-4" /></> },
  { t: 'Easy, cashless payment', d: 'Pay securely online — card, GCash, Maya and more. No awkward cash handovers at your door.', icon: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></> },
  { t: 'You choose your professional', d: 'Compare therapists by rating, experience and rate, and pick the one that’s right for you.', icon: <><circle cx="9" cy="7" r="4" /><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /><path d="m16 11 2 2 4-4" /></> },
]

// Why therapists choose Nickel (monochrome line icons).
const WHY = [
  { t: 'No awkward money talk', d: 'Clients pay through the app at your set rate — no haggling or chasing payment in person.', icon: <><path d="M12 2v20" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></> },
  { t: 'No self-advertising', d: 'You don’t have to market yourself on social media. Nickel puts you in front of clients looking for therapy.', icon: <><path d="M3 11l18-5v12L3 14v-3Z" /><path d="M11.6 16.8a3 3 0 0 1-5.8-1.6" /></> },
  { t: 'Clients come to you', d: 'Get found on the marketplace, or reply to clients who post a request. Two easy ways to fill your schedule.', icon: <><circle cx="9" cy="7" r="4" /><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M16 3.1a4 4 0 0 1 0 7.8M21 21v-2a4 4 0 0 0-3-3.9" /></> },
  { t: 'You control your time', d: 'Set your own rate and open only the days and hours you want. Accept or decline any booking.', icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  { t: 'You set what you earn', d: 'Name your rate. Nickel takes only a flat ₱20 per session — you keep the rest, net of payment fees.', icon: <><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z" /><path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 2.5-3 2-3 4M12 17h.01" /></> },
  { t: 'Weekly payouts', d: 'Your earnings land in your Nickel wallet on completion and are paid out to your bank or GCash every week.', icon: <><path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v1M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3M21 12v-2a1 1 0 0 0-1-1h-4a2 2 0 0 0 0 4h4a1 1 0 0 0 1-1Z" /></> },
]

export default function NickelHome() {
  return (
    <div className="animate-fade-up space-y-6">
      {/* Hero */}
      <section
        className="relative overflow-hidden rounded-[22px] p-7 text-white shadow-[0_12px_36px_rgba(34,48,63,0.25)] sm:p-10"
        style={{ background: 'linear-gradient(135deg, var(--steel), var(--steel-deep))' }}
      >
        <span className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-white opacity-10" />
        <span className="pointer-events-none absolute -bottom-16 right-16 h-32 w-32 rounded-full bg-white opacity-5" />
        <div className="relative">
          <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-white/70">Homecare therapy</div>
          <h1 className="mt-2 text-[34px] font-bold leading-[1.05] text-white sm:whitespace-nowrap sm:text-[44px]">
            Therapy that comes to <span className="font-script font-normal text-white" style={{ fontSize: '1.35em', lineHeight: 0 }}>you</span>.
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-snug text-white/85 sm:text-[16px]">
            Nickel connects you with <strong className="font-semibold text-white">PRC-licensed therapists</strong> near you. Pick a therapist by their schedule, book a time, and they&apos;ll come to your home.
          </p>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-[12.5px] font-medium text-white">
            <span aria-hidden>✓</span> Every therapist is PRC-licensed and identity-verified
          </div>
          <p className="mt-4 text-[13px] text-white/70">
            Made by a physical therapist, for physical therapists. <span className="font-medium text-white/90">Free to use · Filipino-made</span>
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="/book" className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-[15px] font-semibold" style={{ color: 'var(--steel-deep)' }}>
              Find a therapist →
            </a>
            <a href="/provider/login" className="inline-flex items-center gap-2 rounded-xl border border-white/40 px-6 py-3 text-[15px] font-semibold text-white hover:bg-white/10">
              Provider sign in
            </a>
          </div>
          <p className="mt-4 text-[13px] text-white/80">
            Prefer therapists to come to you? <a href="/requests" className="font-semibold text-white underline underline-offset-2">Post a request</a> with your preferred day and time, and licensed therapists near you will reach out.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="card">
        <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--sky)]">How it works</div>
        <div className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="flex gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[15px] font-bold text-white" style={{ background: 'var(--steel)' }}>{s.n}</div>
              <div>
                <div className="text-[15px] font-semibold text-[color:var(--ink)]">{s.t}</div>
                <p className="mt-0.5 text-[13px] leading-snug text-[color:var(--slate)]">{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Why choose Nickel? (for patients) */}
      <section className="card">
        <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--sky)]">Why choose Nickel?</div>
        <div className="grid gap-4 sm:grid-cols-2">
          {WHY_PATIENT.map((w) => (
            <div key={w.t} className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--mist-2)] text-[color:var(--steel)]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{w.icon}</svg>
              </span>
              <div>
                <div className="text-[14px] font-semibold text-[color:var(--ink)]">{w.t}</div>
                <p className="mt-0.5 text-[12.5px] leading-snug text-[color:var(--slate)]">{w.d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Why choose Nickel? (for therapists) */}
      <section className="card">
        <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--sky)]">Why therapists choose Nickel</div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {WHY.map((w) => (
            <div key={w.t} className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--mist-2)] text-[color:var(--steel)]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{w.icon}</svg>
              </span>
              <div>
                <div className="text-[14px] font-semibold text-[color:var(--ink)]">{w.t}</div>
                <p className="mt-0.5 text-[12.5px] leading-snug text-[color:var(--slate)]">{w.d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Provider CTA + How it works flowchart */}
      <HowItWorks />
    </div>
  )
}
