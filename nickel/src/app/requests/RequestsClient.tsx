'use client'

import { useEffect, useState } from 'react'

interface Offer { id: string; status: string; date: string; startTime: string; rate: number; message: string | null; providerName: string; profession: string; photo: string | null; yearsExperience: string | null }
interface Req { id: string; city: string; profession: string | null; status: string; preferredDate: string | null; preferredTime: string | null; flexibility: string | null; note: string | null; createdAt: string; offers: Offer[] }

const PROF_OPTS: [string, string][] = [['', 'Any discipline'], ['PT', 'Physical Therapist'], ['OT', 'Occupational Therapist'], ['SLP', 'Speech-Language Pathologist'], ['SPED', 'Special Education'], ['PSYCHOLOGY', 'Psychologist']]
const PROF: Record<string, string> = Object.fromEntries(PROF_OPTS)
const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`
const fmtDate = (ymd: string) => new Date(ymd).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })
const fmtTime = (t: string) => { const [h, m] = t.split(':').map(Number); const ap = h < 12 ? 'AM' : 'PM'; return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${ap}` }

export default function RequestsClient({ walletBalance, defaultCity }: { walletBalance: number; defaultCity: string }) {
  const [cities, setCities] = useState<string[]>([])
  const [reqs, setReqs] = useState<Req[]>([])
  const [busy, setBusy] = useState(false)
  const [acting, setActing] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [useWallet, setUseWallet] = useState(true)
  const [f, setF] = useState({ city: defaultCity, profession: '', preferredDate: '', preferredTime: '', flexibility: '', note: '' })
  const set = <K extends keyof typeof f>(k: K, v: string) => setF((s) => ({ ...s, [k]: v }))

  async function load() {
    const d = await fetch('/api/patient/requests').then((r) => r.json()).catch(() => ({ requests: [] }))
    setReqs(d.requests ?? [])
  }
  useEffect(() => {
    fetch('/api/cities').then((r) => r.json()).then((d) => setCities(d.cities ?? [])).catch(() => {})
    load()
  }, [])

  async function create(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true)
    try {
      const r = await fetch('/api/patient/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Could not post request')
      setF({ city: f.city, profession: '', preferredDate: '', preferredTime: '', flexibility: '', note: '' })
      load()
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

  const open = reqs.filter((r) => r.status === 'OPEN')
  const past = reqs.filter((r) => r.status !== 'OPEN')

  return (
    <div className="animate-fade-up mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-[24px] font-semibold text-[color:var(--ink)]">Request a therapist</h1>
        <p className="mt-0.5 text-[13px] text-[color:var(--slate)]">Can’t find the right time on the marketplace? Post when you need a visit and let verified therapists near you reach out. You choose who, and pay only when you accept.</p>
      </div>

      {err && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}

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
        <div className="flex justify-end"><button className="btn-primary" disabled={busy}>{busy ? 'Posting…' : 'Post request'}</button></div>
      </form>

      {walletBalance > 0 && (
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-[color:var(--line)] bg-[color:var(--mist)] px-3 py-2 text-[13px]">
          <input type="checkbox" checked={useWallet} onChange={(e) => setUseWallet(e.target.checked)} className="h-4 w-4" style={{ accentColor: 'var(--steel)' }} />
          <span className="text-[color:var(--slate)]">Use my Nickel wallet credit (<b className="text-[color:var(--ink)]">{peso(walletBalance)}</b>) when I accept an offer</span>
        </label>
      )}

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
    </div>
  )
}
