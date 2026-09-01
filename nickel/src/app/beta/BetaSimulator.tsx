'use client'

import { useRef, useState } from 'react'

// A device-framed, clickable preview of the live Nickel app. The app runs in a
// same-origin iframe, so every in-app link works — it is the real beta, not a mockup.
const ROUTES: { label: string; path: string }[] = [
  { label: 'App home (installed)', path: '/?app=1' },
  { label: 'Website home', path: '/' },
  { label: 'Provider network (therapists)', path: '/book?city=Pasig' },
  { label: 'Book a therapist', path: '/book' },
  { label: 'Rehab doctor consult', path: '/consult' },
  { label: 'Rehab doctor sign up', path: '/doctor/login?mode=signup' },
  { label: 'Provider sign in', path: '/provider/login' },
  { label: 'Doctor sign in', path: '/doctor/login' },
  { label: 'Clinic sign in', path: '/clinic/login' },
  { label: 'My bookings', path: '/bookings' },
  { label: 'Admin', path: '/admin/login' },
]

// One-click auto sign-in as a demo account, then land on that dashboard.
const PREVIEWS: { label: string; api: string; email: string; dest: string }[] = [
  { label: 'Therapist dashboard', api: '/api/provider/login', email: 'demo.pt@nickelcare.com', dest: '/provider' },
  { label: 'Rehab doctor dashboard', api: '/api/doctor/login', email: 'demo.doctor@nickelcare.com', dest: '/doctor' },
  { label: 'Teleconsult room (video)', api: '/api/doctor/login', email: 'demo.doctor@nickelcare.com', dest: '/consult/consult_demo1/room' },
  { label: 'Patient · My bookings', api: '/api/patient/login', email: 'demo.patient@nickelcare.com', dest: '/bookings' },
]
const DEMO_PW = 'NickelDemo2026'

const DEVICES: Record<string, { label: string; w: number; h: number; radius: number; notch: boolean }> = {
  iphone: { label: 'iPhone', w: 390, h: 844, radius: 52, notch: true },
  pixel: { label: 'Android', w: 393, h: 851, radius: 40, notch: false },
  small: { label: 'Compact', w: 360, h: 780, radius: 44, notch: false },
  tablet: { label: 'Tablet', w: 640, h: 900, radius: 30, notch: false },
}

export default function BetaSimulator() {
  const [device, setDevice] = useState<keyof typeof DEVICES>('iphone')
  const [path, setPath] = useState('/?app=1')
  const [nonce, setNonce] = useState(0) // bump to reload the iframe
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const d = DEVICES[device]

  const [signingIn, setSigningIn] = useState<string | null>(null)

  // Scale the frame down on small screens so the whole phone is visible.
  const go = (p: string) => { setPath(p); setNonce((n) => n + 1) }
  const reload = () => setNonce((n) => n + 1)

  // Auto sign-in as a demo account (same origin → the cookie applies to the
  // iframe too), then load that dashboard inside the phone frame.
  async function preview(p: { label: string; api: string; email: string; dest: string }) {
    setSigningIn(p.label)
    try {
      await fetch(p.api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: p.email, password: DEMO_PW }) })
      go(p.dest)
    } finally { setSigningIn(null) }
  }

  return (
    <div className="-mx-4 -my-6 min-h-screen bg-[color:var(--ink)] text-white">
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="font-[family-name:var(--font-display)] text-[26px] font-bold tracking-tight">Nickel</div>
          <span className="rounded-full bg-[color:var(--steel)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider">Beta preview</span>
          <p className="w-full text-[13px] text-white/60 sm:w-auto sm:flex-1">A live, clickable preview of the app in a phone frame. Tap around — everything works.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* Controls */}
          <div className="space-y-5">
            <div>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/50">Device</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(DEVICES).map(([k, v]) => (
                  <button key={k} onClick={() => setDevice(k as keyof typeof DEVICES)}
                    className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors ${device === k ? 'bg-white text-[color:var(--ink)]' : 'bg-white/10 text-white/80 hover:bg-white/20'}`}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/50">Jump to a screen</div>
              <div className="flex flex-col gap-1.5">
                {ROUTES.map((r) => (
                  <button key={r.path} onClick={() => go(r.path)}
                    className={`rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors ${path === r.path ? 'bg-[color:var(--steel)] text-white' : 'bg-white/8 text-white/80 hover:bg-white/15'}`}>
                    {r.label}
                    <span className="ml-1.5 text-[11px] text-white/40">{r.path}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/50">Preview a dashboard (auto sign-in)</div>
              <div className="flex flex-col gap-1.5">
                {PREVIEWS.map((p) => (
                  <button key={p.dest} onClick={() => preview(p)} disabled={!!signingIn}
                    className="flex items-center justify-between rounded-lg bg-white/8 px-3 py-2 text-left text-[13px] font-medium text-white/85 hover:bg-white/15 disabled:opacity-50">
                    {p.label}
                    <span className="text-[11px] text-white/40">{signingIn === p.label ? 'signing in…' : 'open ↗'}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-white/5 p-3 text-[12px] leading-relaxed text-white/60">
              <div className="mb-1 font-semibold text-white/80">Demo logins</div>
              All demo accounts use password <b className="text-white/80">NickelDemo2026</b>:<br />
              Patient: demo.patient@nickelcare.com<br />
              Therapist: demo.pt@nickelcare.com<br />
              Doctor: demo.doctor@nickelcare.com<br />
              <span className="text-white/40">Or use the auto sign-in buttons above.</span>
            </div>

            <button onClick={reload} className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-[12.5px] font-medium text-white/80 hover:bg-white/20">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
              Reload preview
            </button>
          </div>

          {/* Device frame */}
          <div className="flex justify-center overflow-x-auto">
            <div className="shrink-0 pb-6" style={{ width: d.w + 24 }}>
              <div className="relative mx-auto bg-black shadow-[0_30px_80px_rgba(0,0,0,.55)]"
                style={{ width: d.w + 24, height: d.h + 24, borderRadius: d.radius + 8, padding: 12 }}>
                {d.notch && <div className="absolute left-1/2 top-3 z-10 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-black" />}
                <iframe
                  key={nonce}
                  ref={iframeRef}
                  src={path}
                  title="Nickel app preview"
                  allow="camera; microphone; clipboard-write; fullscreen"
                  className="block bg-white"
                  style={{ width: d.w, height: d.h, borderRadius: d.radius, border: 'none' }}
                />
              </div>
              <p className="mt-3 text-center text-[12px] text-white/40">{d.w} × {d.h} · showing <span className="text-white/70">{path}</span></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
