'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import CameraCapture from '@/components/CameraCapture'

function readFile(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file) })
}

interface Offer { id: string; status: string; date: string; startTime: string; rate: number; message: string | null; providerName: string; profession: string; photo: string | null; yearsExperience: string | null }
interface Req { id: string; city: string; profession: string | null; status: string; preferredDate: string | null; preferredTime: string | null; flexibility: string | null; note: string | null; createdAt: string; offers: Offer[] }

const PROF_OPTS: [string, string][] = [['', 'Any discipline'], ['PT', 'Physical Therapist'], ['OT', 'Occupational Therapist'], ['SLP', 'Speech-Language Pathologist'], ['SPED', 'Special Education'], ['PSYCHOLOGY', 'Psychologist']]
const PROF: Record<string, string> = Object.fromEntries(PROF_OPTS)
const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`
const fmtDate = (ymd: string) => new Date(ymd).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })
const fmtTime = (t: string) => { const [h, m] = t.split(':').map(Number); const ap = h < 12 ? 'AM' : 'PM'; return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${ap}` }

export default function RequestsClient({ loggedIn, walletBalance, defaultCity }: { loggedIn: boolean; walletBalance: number; defaultCity: string }) {
  const [cities, setCities] = useState<string[]>([])
  const [reqs, setReqs] = useState<Req[]>([])
  const [me, setMe] = useState(loggedIn)
  const [busy, setBusy] = useState(false)
  const [acting, setActing] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [useWallet, setUseWallet] = useState(true)
  const [f, setF] = useState({ city: defaultCity, profession: '', preferredDate: '', preferredTime: '', flexibility: '', note: '' })
  const set = <K extends keyof typeof f>(k: K, v: string) => setF((s) => ({ ...s, [k]: v }))

  // Inline auth (only reached when a signed-out patient tries to post).
  const [showAuth, setShowAuth] = useState(false)
  const [amode, setAmode] = useState<'signup' | 'login'>('signup')
  const [af, setAf] = useState({ firstName: '', lastName: '', email: '', phone: '', address: '', password: '', confirm: '' })
  const setA = (k: keyof typeof af, v: string) => setAf((s) => ({ ...s, [k]: v }))

  async function load() {
    if (!me) return
    const d = await fetch('/api/patient/requests').then((r) => r.json()).catch(() => ({ requests: [] }))
    setReqs(d.requests ?? [])
  }
  useEffect(() => {
    fetch('/api/cities').then((r) => r.json()).then((d) => setCities(d.cities ?? [])).catch(() => {})
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function postRequest() {
    const r = await fetch('/api/patient/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error ?? 'Could not post request')
    setF({ city: f.city, profession: '', preferredDate: '', preferredTime: '', flexibility: '', note: '' })
    setShowAuth(false)
    load()
  }

  async function create(e: React.FormEvent) {
    e.preventDefault(); setErr(null)
    if (!f.city) { setErr('Please choose a city.'); return }
    if (!me) { setShowAuth(true); return } // ask for an account, then post
    setBusy(true)
    try { await postRequest() } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  // Returning patient: sign in just to view their requests & offers (no posting).
  const [viewLogin, setViewLogin] = useState(false)
  async function signInToView(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true)
    try {
      const r = await fetch('/api/patient/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: af.email, password: af.password }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Could not sign in')
      setMe(true); setViewLogin(false); await load()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  async function doAuth(e: React.FormEvent) {
    e.preventDefault(); setErr(null)
    if (amode === 'signup') { if (af.password.length < 8) return setErr('Password must be at least 8 characters.'); if (af.password !== af.confirm) return setErr('Passwords do not match.') }
    setBusy(true)
    try {
      const url = amode === 'signup' ? '/api/patient/signup' : '/api/patient/login'
      const body = amode === 'signup' ? { firstName: af.firstName, lastName: af.lastName, email: af.email, phone: af.phone, address: af.address, city: f.city || undefined, password: af.password } : { email: af.email, password: af.password }
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Failed')
      setMe(true)
      await postRequest() // submit the request they were posting
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  async function accept(offerId: string) {
    setActing(offerId); setErr(null)
    try {
      const r = await fetch('/api/patient/requests/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ offerId, useWallet }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Could not accept')
      if (d.paid) { window.location.href = d.redirect ?? '/bookings'; return }
      if (d.checkoutUrl) { window.location.href = d.checkoutUrl; return }
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); setActing(null) }
  }

  async function cancel(requestId: string) {
    if (!confirm('Cancel this request?')) return
    setActing(requestId)
    try { await fetch('/api/patient/requests/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId }) }); load() }
    finally { setActing(null) }
  }

  // Attach a doctor's referral → the request goes live to therapists.
  const [cameraFor, setCameraFor] = useState<string | null>(null)
  const [qrFor, setQrFor] = useState<string | null>(null)
  const [qrImg, setQrImg] = useState<string>('')
  async function attachReferral(requestId: string, dataUri: string) {
    if (dataUri.length > 12_000_000) { setErr('File too large (max ~9 MB).'); return }
    setActing(requestId); setErr(null)
    try {
      const r = await fetch('/api/patient/requests/referral', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId, referralFile: dataUri }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Failed')
      setQrFor(null); load()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setActing(null) }
  }
  async function showQr(requestId: string) {
    setErr(null)
    if (qrFor === requestId) { setQrFor(null); return }
    try {
      const d = await fetch(`/api/patient/requests/upload-token?requestId=${requestId}`).then((r) => r.json())
      if (!d.url) throw new Error(d.error ?? 'Could not create link')
      setQrImg(await QRCode.toDataURL(d.url, { width: 220, margin: 1 }))
      setQrFor(requestId)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') }
  }

  const pending = reqs.filter((r) => r.status === 'PENDING_REFERRAL')
  const open = reqs.filter((r) => r.status === 'OPEN')
  const past = reqs.filter((r) => r.status === 'MATCHED' || r.status === 'CANCELLED')

  return (
    <div className="animate-fade-up mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-[24px] font-semibold text-[color:var(--ink)]">Request a therapist</h1>
        <p className="mt-0.5 text-[13px] text-[color:var(--slate)]">Can’t find the right time when browsing therapists? Post when you need a visit and let verified therapists near you reach out. You choose who, and pay only when you accept. <b className="text-[color:var(--ink)]">Your request goes live once you attach a doctor’s referral</b> (upload, photo, or scan on your phone).</p>
      </div>

      {err && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}

      {/* Returning patient — sign in to see existing requests & offers */}
      {!me && (
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[13.5px] text-[color:var(--slate)]">Already posted a request? <b className="text-[color:var(--ink)]">Sign in</b> to see your requests and the therapists who reached out.</div>
            <button type="button" onClick={() => setViewLogin((s) => !s)} className="btn-outline shrink-0 !px-4 !py-2 !text-[13px]">{viewLogin ? 'Close' : 'Sign in'}</button>
          </div>
          {viewLogin && (
            <form onSubmit={signInToView} className="mt-3 space-y-2">
              <input className="input" type="email" placeholder="Email" required value={af.email} onChange={(e) => setA('email', e.target.value)} />
              <input className="input" type="password" placeholder="Password" required value={af.password} onChange={(e) => setA('password', e.target.value)} />
              <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in & see my requests'}</button>
            </form>
          )}
        </div>
      )}

      {/* Create */}
      <form onSubmit={create} className="card space-y-3">
        <h2 className="text-[15px] font-semibold text-[color:var(--ink)]">Post a new request</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="label">City</div>
            <select className="select" required value={f.city} onChange={(e) => set('city', e.target.value)}>
              <option value="">Choose a city…</option>
              {cities.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div className="label">Discipline (optional)</div>
            <select className="select" value={f.profession} onChange={(e) => set('profession', e.target.value)}>
              {PROF_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <div className="label">Preferred date (optional)</div>
            <input className="input" type="date" value={f.preferredDate} onChange={(e) => set('preferredDate', e.target.value)} />
          </div>
          <div>
            <div className="label">Preferred time (optional)</div>
            <input className="input" type="time" value={f.preferredTime} onChange={(e) => set('preferredTime', e.target.value)} />
          </div>
        </div>
        <div>
          <div className="label">Flexibility (optional)</div>
          <input className="input" value={f.flexibility} onChange={(e) => set('flexibility', e.target.value)} placeholder="e.g. weekday mornings also work" />
        </div>
        <div>
          <div className="label">What do you need help with? (optional)</div>
          <textarea className="input min-h-[70px]" value={f.note} onChange={(e) => set('note', e.target.value)} placeholder="e.g. post-stroke rehab for my father, twice a week" />
        </div>
        {!me && showAuth && (
          <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--mist)] p-4">
            <div className="text-[13.5px] font-semibold text-[color:var(--ink)]">{amode === 'signup' ? 'Create your account to post' : 'Sign in to post'}</div>
            <p className="mb-3 mt-0.5 text-[12px] text-[color:var(--slate)]">Your request is saved right after you {amode === 'signup' ? 'sign up' : 'sign in'}. Attach a doctor’s referral next and it goes live to therapists near you.</p>
            <div className="mb-3 flex rounded-xl border border-[color:var(--line)] bg-white p-1 text-[13px]">
              <button type="button" onClick={() => setAmode('signup')} className={`flex-1 rounded-lg py-2 font-medium ${amode === 'signup' ? 'bg-[color:var(--steel)] text-white' : 'text-[color:var(--slate)]'}`}>New patient</button>
              <button type="button" onClick={() => setAmode('login')} className={`flex-1 rounded-lg py-2 font-medium ${amode === 'login' ? 'bg-[color:var(--steel)] text-white' : 'text-[color:var(--slate)]'}`}>Sign in</button>
            </div>
            <div className="space-y-3">
              {amode === 'signup' && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2"><input className="input" placeholder="First name" required value={af.firstName} onChange={(e) => setA('firstName', e.target.value)} /><input className="input" placeholder="Last name" required value={af.lastName} onChange={(e) => setA('lastName', e.target.value)} /></div>
                  <input className="input" placeholder="Cellphone no." value={af.phone} onChange={(e) => setA('phone', e.target.value)} />
                  <input className="input" placeholder="Home address (for the visit)" value={af.address} onChange={(e) => setA('address', e.target.value)} />
                </>
              )}
              <input className="input" type="email" placeholder="Email" required value={af.email} onChange={(e) => setA('email', e.target.value)} />
              <input className="input" type="password" placeholder="Password" required value={af.password} onChange={(e) => setA('password', e.target.value)} />
              {amode === 'signup' && <input className="input" type="password" placeholder="Confirm password" required value={af.confirm} onChange={(e) => setA('confirm', e.target.value)} />}
              <button type="button" className="btn-primary w-full" disabled={busy} onClick={doAuth}>{busy ? 'Please wait…' : amode === 'signup' ? 'Create account & post request' : 'Sign in & post request'}</button>
            </div>
          </div>
        )}
        <div className="flex justify-end"><button className="btn-primary" disabled={busy}>{busy ? 'Posting…' : me ? 'Post request' : 'Continue'}</button></div>
      </form>

      {walletBalance > 0 && (
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-[color:var(--line)] bg-[color:var(--mist)] px-3 py-2 text-[13px]">
          <input type="checkbox" checked={useWallet} onChange={(e) => setUseWallet(e.target.checked)} className="h-4 w-4" style={{ accentColor: 'var(--steel)' }} />
          <span className="text-[color:var(--slate)]">Use my Nickel wallet credit (<b className="text-[color:var(--ink)]">{peso(walletBalance)}</b>) when I accept an offer</span>
        </label>
      )}

      {/* Pending referral — not live until a referral is attached */}
      {pending.length > 0 && <h2 className="pt-1 text-[15px] font-semibold text-[color:var(--ink)]">Attach a referral to go live</h2>}
      {pending.map((r) => (
        <div key={r.id} className="card border-amber-200 bg-amber-50/40">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[14px] font-semibold text-[color:var(--ink)]">{PROF[r.profession ?? ''] ?? r.profession ?? 'Any discipline'} · {r.city}</div>
              <div className="mt-0.5 text-[12.5px] text-[color:var(--slate)]">{r.preferredDate ? `Prefers ${fmtDate(r.preferredDate)}${r.preferredTime ? ` · ${fmtTime(r.preferredTime)}` : ''}` : 'Flexible on date'}</div>
              {r.note && <p className="mt-1 text-[12.5px] text-[color:var(--slate)]">“{r.note}”</p>}
            </div>
            <button onClick={() => cancel(r.id)} disabled={acting === r.id} className="shrink-0 text-[12px] font-medium text-[color:var(--slate)] hover:text-red-600">Cancel</button>
          </div>
          <div className="mt-3 rounded-xl border border-amber-200 bg-white p-3">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-amber-900">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/></svg>
              Not yet visible to therapists
            </div>
            <p className="mt-1 text-[12px] text-[color:var(--slate)]">Philippine practice requires a doctor’s referral for physical therapy. Attach one and your request goes live to therapists near you.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <label className="cursor-pointer rounded-lg border border-[color:var(--line-2)] px-3 py-2 text-[12.5px] font-medium text-[color:var(--steel)] hover:bg-[color:var(--mist)]">
                {acting === r.id ? 'Uploading…' : 'Upload file'}
                <input type="file" accept="image/*,application/pdf" className="hidden" disabled={acting === r.id} onChange={async (e) => { const file = e.target.files?.[0]; if (file) attachReferral(r.id, await readFile(file)) }} />
              </label>
              <button type="button" onClick={() => setCameraFor(r.id)} disabled={acting === r.id} className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--line-2)] px-3 py-2 text-[12.5px] font-medium text-[color:var(--ink)] hover:bg-[color:var(--mist)]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z"/><circle cx="12" cy="13" r="4"/></svg>
                Take photo
              </button>
              <button type="button" onClick={() => showQr(r.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--line-2)] px-3 py-2 text-[12.5px] font-medium text-[color:var(--ink)] hover:bg-[color:var(--mist)]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M21 14v7h-7"/></svg>
                {qrFor === r.id ? 'Hide QR' : 'Scan on my phone'}
              </button>
            </div>
            {qrFor === r.id && qrImg && (
              <div className="mt-3 flex flex-col items-center rounded-xl border border-[color:var(--line)] bg-[color:var(--mist)] p-3 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrImg} alt="Scan to upload from your phone" className="h-40 w-40" />
                <p className="mt-1.5 text-[12px] text-[color:var(--slate)]">Scan with your phone camera to take a photo of the referral there. This request updates automatically. Link valid ~30 minutes.</p>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Open requests + offers */}
      {open.length > 0 && <h2 className="pt-1 text-[15px] font-semibold text-[color:var(--ink)]">Your open requests</h2>}
      {open.map((r) => (
        <div key={r.id} className="card">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[14px] font-semibold text-[color:var(--ink)]">{PROF[r.profession ?? ''] ?? r.profession ?? 'Any discipline'} · {r.city}</div>
              <div className="mt-0.5 text-[12.5px] text-[color:var(--slate)]">
                {r.preferredDate ? `Prefers ${fmtDate(r.preferredDate)}${r.preferredTime ? ` · ${fmtTime(r.preferredTime)}` : ''}` : 'Flexible on date'}
                {r.flexibility ? ` · ${r.flexibility}` : ''}
              </div>
              {r.note && <p className="mt-1 text-[12.5px] text-[color:var(--slate)]">“{r.note}”</p>}
            </div>
            <button onClick={() => cancel(r.id)} disabled={acting === r.id} className="shrink-0 text-[12px] font-medium text-[color:var(--slate)] hover:text-red-600">Cancel</button>
          </div>

          <div className="mt-3 border-t border-[color:var(--line)] pt-3">
            {r.offers.length === 0
              ? <p className="text-[12.5px] text-[color:var(--muted)]">No offers yet — therapists near you will reach out here.</p>
              : (
                <div className="space-y-2">
                  <div className="text-[12px] font-semibold text-[color:var(--muted)]">{r.offers.length} therapist{r.offers.length === 1 ? '' : 's'} reached out</div>
                  {r.offers.map((o) => (
                    <div key={o.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[color:var(--line)] p-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color:var(--mist-2)] text-[12px] font-semibold text-[color:var(--steel)]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {o.photo ? <img src={o.photo} alt="" className="h-full w-full object-cover" /> : o.providerName.split(' ').map((x) => x[0]).slice(0, 2).join('')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-semibold text-[color:var(--ink)]">{o.providerName}</div>
                        <div className="text-[12px] text-[color:var(--slate)]">{fmtDate(o.date)} · {fmtTime(o.startTime)}{o.yearsExperience ? ` · ${o.yearsExperience} yr${o.yearsExperience === '1' ? '' : 's'} exp` : ''}</div>
                        {o.message && <p className="mt-0.5 text-[12px] text-[color:var(--slate)]">“{o.message}”</p>}
                      </div>
                      <div className="text-right">
                        <div className="text-[15px] font-bold text-[color:var(--steel-deep,#1e4b7d)]">{peso(o.rate)}</div>
                        <button onClick={() => accept(o.id)} disabled={acting === o.id} className="btn-primary mt-1 !px-3 !py-1.5 !text-[12.5px]">{acting === o.id ? '…' : 'Accept & pay'}</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>
      ))}

      {past.length > 0 && (
        <>
          <h2 className="pt-1 text-[15px] font-semibold text-[color:var(--ink)]">Past requests</h2>
          {past.map((r) => (
            <div key={r.id} className="card flex items-center justify-between">
              <div className="text-[13px] text-[color:var(--slate)]">{PROF[r.profession ?? ''] ?? 'Any discipline'} · {r.city}</div>
              <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${r.status === 'MATCHED' ? 'bg-emerald-50 text-emerald-700' : 'bg-[color:var(--mist-2)] text-[color:var(--slate)]'}`}>{r.status === 'MATCHED' ? 'Matched' : 'Cancelled'}</span>
            </div>
          ))}
        </>
      )}

      <CameraCapture open={cameraFor !== null} onClose={() => setCameraFor(null)} onCapture={(uri) => { const id = cameraFor; setCameraFor(null); if (id) attachReferral(id, uri) }} />
    </div>
  )
}
