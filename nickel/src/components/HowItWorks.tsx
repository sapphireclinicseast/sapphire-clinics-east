'use client'

import { useState } from 'react'

// Monochrome step glyphs (brand: line icons, currentColor).
const I = {
  signup: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8v6M22 11h-6" />,
  verify: <path d="M12 3 4 6v6c0 4.5 3.4 7.9 8 9 4.6-1.1 8-4.5 8-9V6l-8-3ZM9 12l2 2 4-4" />,
  rate: <path d="M8 4v16M8 4h5.5a4 4 0 0 1 0 8H8M5 9h11M5 13h11" />,
  connect: <path d="M8.5 14a4.5 4.5 0 0 1 0-9h2M15.5 10a4.5 4.5 0 0 1 0 9h-2M8 12h8" />,
  visit: <path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9ZM9 21v-7h6v7" />,
  wallet: <path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v1M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3M21 12v-2a1 1 0 0 0-1-1h-4a2 2 0 0 0 0 4h4a1 1 0 0 0 1-1Z" />,
}

interface Step { icon: keyof typeof I; t: string; d: string }
const STEPS: Step[] = [
  { icon: 'signup', t: 'Sign up free', d: 'Create your therapist account in minutes — no joining or monthly fees.' },
  { icon: 'verify', t: 'Get verified', d: 'Submit your PRC licence and a quick ID check. We approve you to go live.' },
  { icon: 'rate', t: 'Set rate & schedule', d: 'Name your own rate and open the days and times you can do home visits.' },
  { icon: 'connect', t: 'Connect with clients', d: 'Two ways to match — clients book you, or you reach out to clients who posted a request.' },
  { icon: 'visit', t: 'Do the home visit', d: 'You travel to the client’s home at the agreed time and deliver the session.' },
  { icon: 'wallet', t: 'Get paid', d: 'Mark the visit complete — your earnings (your full rate, less only payment fees) land in your Nickel wallet, paid out weekly.' },
]

function Glyph({ icon }: { icon: keyof typeof I }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{I[icon]}</svg>
}

export default function HowItWorks() {
  const [open, setOpen] = useState(false)
  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-[200px] flex-1">
          <div className="text-[16px] font-semibold text-[color:var(--ink)]">Are you a therapist?</div>
          <p className="text-[13px] text-[color:var(--slate)]">Join Nickel, set your own rate and schedule, and reach clients near you.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="btn-outline shrink-0">
            {open ? 'Hide' : 'How does it work?'}
          </button>
          <a href="/provider/signup" className="btn-primary shrink-0">Join as a therapist</a>
        </div>
      </div>

      {open && (
        <div className="animate-fade-up mt-4 overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[color:var(--mist)] p-5 sm:p-6">
          <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--sky)]">How Nickel works for therapists</div>

          {/* Horizontal flow — scrolls on small screens */}
          <div className="-mx-1 overflow-x-auto px-1 pb-2 pt-3">
            <ol className="flex min-w-max items-stretch gap-0">
              {STEPS.map((s, i) => (
                <li key={s.t} className="flex items-stretch">
                  <div className="flex w-[168px] flex-col items-center px-1 text-center">
                    <div className="relative flex w-full items-center justify-center">
                      {/* connector left */}
                      {i > 0 && <span className="absolute left-0 right-1/2 top-1/2 h-[2px] -translate-y-1/2 bg-[color:var(--line-2)]" />}
                      {/* connector right */}
                      {i < STEPS.length - 1 && <span className="absolute left-1/2 right-0 top-1/2 h-[2px] -translate-y-1/2 bg-[color:var(--line-2)]" />}
                      <span
                        className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-[0_8px_20px_rgba(47,107,176,.28)]"
                        style={{ background: 'linear-gradient(135deg, var(--steel), var(--steel-deep))' }}
                      >
                        <Glyph icon={s.icon} />
                        <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] font-bold text-[color:var(--steel-deep,#1e4b7d)] shadow">{i + 1}</span>
                      </span>
                    </div>
                    <div className="mt-3 text-[13.5px] font-semibold text-[color:var(--ink)]">{s.t}</div>
                    <p className="mt-1 text-[12px] leading-snug text-[color:var(--slate)]">{s.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* The two matching modes */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[color:var(--line)] bg-white p-4">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-[color:var(--ink)]">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[color:var(--mist-2)] text-[color:var(--steel)]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                </span>
                Clients find you
              </div>
              <p className="mt-1.5 text-[12.5px] leading-snug text-[color:var(--slate)]">You appear in the Nickel provider network for your cities. Clients browse verified therapists, pick you, choose a time and pay.</p>
            </div>
            <div className="rounded-xl border border-[color:var(--line)] bg-white p-4">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-[color:var(--ink)]">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[color:var(--mist-2)] text-[color:var(--steel)]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l19-9-9 19-2-8-8-2Z" /></svg>
                </span>
                You reach out
              </div>
              <p className="mt-1.5 text-[12.5px] leading-snug text-[color:var(--slate)]">Clients can post a request with their preferred day and time. Browse open requests near you and offer a slot — when they confirm, they’re taken to payment.</p>
            </div>
          </div>

          <div className="mt-4">
            <a href="/provider/signup" className="btn-primary inline-block">Join as a therapist →</a>
          </div>
        </div>
      )}
    </section>
  )
}
