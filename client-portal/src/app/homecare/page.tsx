import type { Metadata } from 'next'

// Aura at Home — the dedicated welcome/landing page for the traveling-PT
// homecare service. Separate front door from the main patient portal; the
// booking wizard lives at /homecare/book.

export const metadata: Metadata = {
  title: 'Aura at Home — Physiotherapy at your doorstep',
  description: 'Aura at Home brings a licensed physical therapist from Aura Health Rehab straight to your home. Pick your city, choose a time, and we come to you.',
}

function IconPin() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
  )
}
function IconClock() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
  )
}
function IconHomeHeart() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" /><path d="M9.2 12.3c.9-.9 2.2-.2 2.8.4.6-.6 1.9-1.3 2.8-.4.7.8.5 1.8-.2 2.5L12 17.2l-2.6-2.4c-.7-.7-.9-1.7-.2-2.5Z" /></svg>
  )
}

const STEPS = [
  { icon: <IconPin />, title: 'Pick your city & day', body: 'Choose where you are and the branch nearest you. We visit each area on set days.' },
  { icon: <IconClock />, title: 'Choose a time', body: 'Pick a visit time that works for you — each home session runs about an hour.' },
  { icon: <IconHomeHeart />, title: 'We come to you', body: 'A licensed physical therapist from Aura Health Rehab arrives at your doorstep.' },
]

export default function AuraAtHomePage() {
  return (
    <div className="animate-fade-up mx-auto max-w-2xl space-y-6">
      {/* Hero */}
      <section
        className="relative overflow-hidden rounded-[22px] p-7 text-white shadow-[0_12px_36px_rgba(27,63,56,0.28)]"
        style={{ background: 'linear-gradient(135deg, var(--deep-teal), var(--teal))' }}
      >
        <span className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full opacity-20" style={{ background: 'var(--gold)' }} />
        <span className="pointer-events-none absolute -bottom-16 right-6 h-32 w-32 rounded-full bg-white opacity-10" />
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/aura-mark-cream.png" alt="Aura Health Rehab" className="mb-4 h-8 w-auto" />
          <h1 className="text-[32px] font-bold leading-[1.05] text-white sm:text-[38px]">Aura at Home</h1>
          <p className="mt-2 max-w-md text-[15px] leading-snug text-white/85">
            Licensed physical therapy, right at your doorstep — brought to you by Aura Health Rehab.
          </p>
          <a
            href="/homecare/book"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[15px] font-semibold transition-transform duration-200 hover:gap-3"
            style={{ color: 'var(--deep-teal)' }}
          >
            Book a home visit
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
          </a>
        </div>
      </section>

      {/* How it works */}
      <section className="card-static">
        <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--moss)]">How it works</div>
        <div className="space-y-4">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[color:var(--paper-2)] text-[color:var(--deep-teal)]">
                {s.icon}
              </div>
              <div className="min-w-0">
                <div className="text-[15px] font-semibold text-[color:var(--narra)]" style={{ fontFamily: 'var(--font-display)' }}>
                  {i + 1}. {s.title}
                </div>
                <p className="mt-0.5 text-[13px] leading-snug text-[color:var(--mid-gray)]">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Good to know */}
      <section className="card-static">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--moss)]">Good to know</div>
        <ul className="space-y-2.5 text-[13.5px] text-[color:var(--narra)]">
          {[
            'Delivered by licensed physical therapists from Aura Health Rehab.',
            "A doctor's referral is required to book a home visit.",
            'You pay one secure total: the session fee plus travel from the clinic to your home.',
            'You create a portal account as you book, so you can track your sessions after.',
          ].map((t, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <svg className="mt-0.5 shrink-0 text-[color:var(--moss)]" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* CTA footer */}
      <div className="flex flex-col items-center gap-3 pb-2 text-center">
        <a href="/homecare/book" className="btn-cta">Book a home visit →</a>
        <a href="/" className="text-[12px] text-[color:var(--moss)] hover:underline">← Back to the patient portal</a>
      </div>
    </div>
  )
}
