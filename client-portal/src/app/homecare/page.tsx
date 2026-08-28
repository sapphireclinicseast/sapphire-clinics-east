'use client'

// Homecare Physical Therapy booking flow.
// city → nearer branch → open travel date → patient details + portal account
// (Doctor's Referral REQUIRED) → review fare (session + distance transport +
// surge) → PayMongo. All data goes through the same /api/booking-proxy that the
// rest of the portal uses, hitting the operations app's /api/public/homecare/*.

import { useEffect, useMemo, useState } from 'react'
import { branchLabel } from '@/lib/branch-label'
import { setSession } from '@/lib/session'

const PROXY = '/api/booking-proxy/homecare'

type Short = 'SBEA' | 'SBGH'
interface City { id: string; name: string; province: string | null; branches: Short[]; nextDate: string | null }
// An expanded upcoming occurrence of a weekly rule (openDayId) on a concrete date.
interface OpenDay { openDayId: string; cityId: string; branch: Short; dayOfWeek: number; date: string; startTime: string; endTime: string; slotMinutes: number; times: string[] }

// "13:00" → "1:00 PM"
function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ap = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`
}
interface Fare {
  ok: boolean
  method: string
  distanceKm: number | null
  sessionFee: number
  baseTransport: number
  surgeMultiplier: number
  surgeLabel: string | null
  transportFee: number
  total: number
  breakdown: string[]
  notes: string | null
}

type Step = 'city' | 'branch' | 'date' | 'details' | 'pay'
const STEPS: { key: Step; label: string }[] = [
  { key: 'city', label: 'City' },
  { key: 'date', label: 'Schedule' },
  { key: 'details', label: 'Your details' },
  { key: 'pay', label: 'Payment' },
]

// Read a File as a base64 data URL, rejecting anything over 12 MB.
function fileToDataUrl(file: File): Promise<{ name: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    if (file.size > 12 * 1024 * 1024) return reject(new Error('File is larger than 12 MB.'))
    const r = new FileReader()
    r.onload = () => resolve({ name: file.name, dataUrl: String(r.result) })
    r.onerror = () => reject(new Error('Could not read that file.'))
    r.readAsDataURL(file)
  })
}

const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`

export default function HomecarePage() {
  const [step, setStep] = useState<Step>('city')

  // selections
  const [cities, setCities] = useState<City[] | null>(null)
  const [city, setCity] = useState<City | null>(null)
  const [branch, setBranch] = useState<Short | null>(null)
  const [openDays, setOpenDays] = useState<OpenDay[] | null>(null)
  const [day, setDay] = useState<OpenDay | null>(null)
  const [time, setTime] = useState<string | null>(null)

  // patient + account form
  const [f, setF] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    password: '', confirm: '', username: '',
    dob: '', sex: '', patientType: 'ADULT',
    address: '', city: '', civilStatus: '', religion: '', nationality: '', pwdSeniorId: '', diagnosis: '',
  })
  const [referralFile, setReferralFile] = useState<{ name: string; dataUrl: string } | null>(null)
  const [pwdIdFile, setPwdIdFile] = useState<{ name: string; dataUrl: string } | null>(null)
  const [showMore, setShowMore] = useState(false)

  const [fare, setFare] = useState<Fare | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }))

  // ── load cities on mount ────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${PROXY}/cities`)
      .then((r) => r.json())
      .then((d) => setCities(d.cities ?? []))
      .catch(() => setErr('Could not load available cities. Please try again.'))
  }, [])

  // ── load open days when city+branch chosen ──────────────────────────────
  // cityId is passed explicitly so single-branch cities can call this in the
  // same tick as setCity (state isn't committed yet at that point).
  async function chooseBranch(b: Short, cityId: string) {
    setBranch(b)
    setDay(null)
    setTime(null)
    setOpenDays(null)
    setStep('date')
    try {
      const r = await fetch(`${PROXY}/open-days?cityId=${encodeURIComponent(cityId)}&branch=${b}`)
      const d = await r.json()
      setOpenDays(d.openDays ?? [])
    } catch {
      setErr('Could not load open dates. Please try again.')
    }
  }

  function chooseCity(c: City) {
    setErr(null)
    setCity(c)
    setBranch(null)
    setDay(null)
    setTime(null)
    if (c.branches.length === 1) {
      // Only one serving branch — skip the branch step.
      chooseBranch(c.branches[0], c.id)
    } else {
      setStep('branch')
    }
  }

  // ── go to review: fetch authoritative quote ─────────────────────────────
  async function goToPay() {
    setErr(null)
    // required-field validation
    const need: [string, string][] = [
      ['first name', f.firstName], ['last name', f.lastName], ['email', f.email],
      ['home address', f.address], ['username', f.username], ['password', f.password],
    ]
    for (const [label, v] of need) if (!v.trim()) { setErr(`Please enter your ${label}.`); return }
    if (f.password.length < 8) { setErr('Password must be at least 8 characters.'); return }
    if (f.password !== f.confirm) { setErr('Passwords do not match.'); return }
    if (!referralFile) { setErr("A Doctor's Referral upload is required for homecare."); return }
    if (!day || !time) { setErr('Please pick a day and time.'); return }

    setBusy(true)
    try {
      const r = await fetch(`${PROXY}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, address: f.address, openDayId: day!.openDayId, date: day!.date }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Could not compute the fare.')
      setFare(d.fare as Fare)
      setStep('pay')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not compute the fare.')
    } finally {
      setBusy(false)
    }
  }

  // ── submit booking → redirect to PayMongo ───────────────────────────────
  async function payNow() {
    setBusy(true)
    setErr(null)
    try {
      const r = await fetch(`${PROXY}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cityId: city!.id, openDayId: day!.openDayId, date: day!.date, time, branch,
          firstName: f.firstName, lastName: f.lastName, email: f.email, phone: f.phone,
          dob: f.dob, sex: f.sex, patientType: f.patientType,
          address: f.address, city: f.city || city!.name,
          civilStatus: f.civilStatus, religion: f.religion, nationality: f.nationality,
          pwdSeniorId: f.pwdSeniorId, diagnosis: f.diagnosis,
          username: f.username, password: f.password,
          referralFile, pwdIdFile,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Could not start the booking.')
      // Sign the patient in so they land on their portal after paying.
      if (d.token && d.patientId) setSession({ patientId: d.patientId, firstName: d.firstName ?? f.firstName, token: d.token })
      window.location.href = d.checkoutUrl
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not start the booking.')
      setBusy(false)
    }
  }

  const activeIdx = useMemo(() => {
    const map: Record<Step, number> = { city: 0, branch: 0, date: 1, details: 2, pay: 3 }
    return map[step]
  }, [step])

  return (
    <div className="animate-fade-up mx-auto max-w-2xl">
      {/* step header — compact on mobile: dots + only the active label, so the
          4 steps never overflow a phone width. Full labels show from sm up. */}
      <div className="mb-6 flex items-center gap-1.5 sm:gap-3" style={{ fontFamily: 'var(--font-display)' }}>
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-1.5 sm:gap-3">
            <div className="flex items-center gap-2">
              <span className={`step-dot ${i === activeIdx ? 'step-dot-active' : i < activeIdx ? 'step-dot-done' : ''}`} />
              <span className={`text-[10px] sm:text-[11.5px] uppercase tracking-[0.1em] sm:tracking-[0.12em] ${i === activeIdx ? 'font-semibold text-[color:var(--clay)]' : i < activeIdx ? 'text-[color:var(--moss)]' : 'text-[color:var(--mid-gray)]'} ${i === activeIdx ? '' : 'hidden sm:inline'}`}>
                {i + 1}. {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && <span className="h-px w-3 sm:w-6 bg-[color:var(--paper-3)]" />}
          </div>
        ))}
      </div>

      <div className="card-static">
        <div className="mb-1 flex items-center gap-2">
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ background: 'var(--sage-tint)', color: 'var(--moss)' }}>Homecare PT</span>
        </div>
        <h1 className="text-[26px] leading-tight text-[color:var(--deep-teal)]">Book a home visit</h1>
        <p className="mb-6 mt-1 text-sm text-[color:var(--mid-gray)]">A licensed physical therapist travels to your home. Payment covers the session plus travel from the clinic.</p>

        {err && <div className="mb-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800">{err}</div>}

        {/* ── STEP: city ───────────────────────────────────────────────── */}
        {step === 'city' && (
          <div>
            <div className="label">Which city are you in?</div>
            {!cities && <p className="text-sm text-[color:var(--mid-gray)]">Loading cities…</p>}
            {cities && cities.length === 0 && (
              <p className="text-sm text-[color:var(--mid-gray)]">No homecare cities are open yet. Please check back soon or contact the clinic.</p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {cities?.filter((c) => c.branches.length > 0).map((c) => (
                <button key={c.id} onClick={() => chooseCity(c)}
                  className="rounded-2xl border-[1.5px] border-[color:var(--paper-3)] bg-white p-4 text-left transition-all hover:border-[color:var(--sage)] hover:shadow-[0_4px_14px_rgba(27,63,56,0.08)]"
                  style={{ fontFamily: 'var(--font-display)' }}>
                  <div className="text-[15px] font-semibold text-[color:var(--narra)]">{c.name}</div>
                  {c.province && <div className="text-[11px] text-[color:var(--mid-gray)]">{c.province}</div>}
                  {c.nextDate && <div className="mt-1 text-[11px] text-[color:var(--moss)]">Next open: {new Date(c.nextDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</div>}
                </button>
              ))}
            </div>
            {cities && cities.length > 0 && cities.every((c) => c.branches.length === 0) && (
              <p className="mt-2 text-sm text-[color:var(--mid-gray)]">No open travel dates right now — please check back soon.</p>
            )}
          </div>
        )}

        {/* ── STEP: branch ─────────────────────────────────────────────── */}
        {step === 'branch' && city && (
          <div>
            <button onClick={() => setStep('city')} className="mb-3 text-[12px] text-[color:var(--moss)] hover:underline">← {city.name}</button>
            <div className="label">Which clinic are you closer to?</div>
            <p className="mb-3 text-[12px] text-[color:var(--mid-gray)]">This is where your therapist travels from — it affects the travel cost.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {city.branches.map((b) => (
                <button key={b} onClick={() => chooseBranch(b, city.id)}
                  className="rounded-2xl border-[1.5px] border-[color:var(--paper-3)] bg-white p-4 text-left transition-all hover:border-[color:var(--sage)]"
                  style={{ fontFamily: 'var(--font-display)' }}>
                  <div className="text-[15px] font-semibold text-[color:var(--narra)]">{branchLabel(b)}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP: date → time ────────────────────────────────────────── */}
        {step === 'date' && (
          <div>
            <button
              onClick={() => { if (day) { setDay(null); setTime(null) } else setStep(city && city.branches.length > 1 ? 'branch' : 'city') }}
              className="mb-3 text-[12px] text-[color:var(--moss)] hover:underline"
            >← Back</button>

            {!day ? (
              <>
                <div className="label">Pick a day {branch ? `(${branchLabel(branch)})` : ''}</div>
                <p className="mb-3 text-[12px] text-[color:var(--mid-gray)]">We visit each city on a set weekday. Choose an upcoming date.</p>
                {!openDays && <p className="text-sm text-[color:var(--mid-gray)]">Loading dates…</p>}
                {openDays && openDays.length === 0 && <p className="text-sm text-[color:var(--mid-gray)]">No open dates for this branch yet. Try the other branch or check back soon.</p>}
                <div className="grid gap-2 sm:grid-cols-2">
                  {openDays?.map((d) => (
                    <button key={`${d.openDayId}-${d.date}`} onClick={() => setDay(d)}
                      className="rounded-2xl border-[1.5px] border-[color:var(--paper-3)] bg-white p-4 text-left transition-all hover:border-[color:var(--sage)]"
                      style={{ fontFamily: 'var(--font-display)' }}>
                      <div className="text-[15px] font-semibold text-[color:var(--narra)]">{new Date(d.date).toLocaleDateString('en-PH', { weekday: 'long', month: 'short', day: 'numeric' })}</div>
                      <div className="text-[11px] text-[color:var(--mid-gray)]">{d.times.length} time{d.times.length === 1 ? '' : 's'} available</div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="label">Choose a time — {new Date(day.date).toLocaleDateString('en-PH', { weekday: 'long', month: 'short', day: 'numeric' })}</div>
                <p className="mb-3 text-[12px] text-[color:var(--mid-gray)]">Pick your preferred visit time (each home visit is about an hour).</p>
                <div className="flex flex-wrap gap-2">
                  {day.times.map((t) => (
                    <button key={t}
                      onClick={() => { setTime(t); setF((s) => ({ ...s, city: city?.name ?? s.city })); setStep('details') }}
                      className="rounded-xl border-[1.5px] border-[color:var(--paper-3)] bg-white px-4 py-2.5 text-[14px] font-semibold text-[color:var(--narra)] transition-all hover:border-[color:var(--sage)] hover:shadow-[0_4px_12px_rgba(27,63,56,0.08)]"
                      style={{ fontFamily: 'var(--font-display)' }}>
                      {fmtTime(t)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── STEP: details ────────────────────────────────────────────── */}
        {step === 'details' && day && (
          <div>
            <button onClick={() => setStep('date')} className="mb-3 text-[12px] text-[color:var(--moss)] hover:underline">← {new Date(day.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</button>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First name" required value={f.firstName} onChange={(v) => set('firstName', v)} />
              <Field label="Last name" required value={f.lastName} onChange={(v) => set('lastName', v)} />
              <Field label="Email" type="email" required value={f.email} onChange={(v) => set('email', v)} />
              <Field label="Cellphone no." value={f.phone} onChange={(v) => set('phone', v)} placeholder="+63 9XX XXX XXXX" />
              <div className="sm:col-span-2">
                <div className="label">Complete home address (for the visit) <span className="text-[color:var(--clay)]">*</span></div>
                <textarea className="input" rows={2} value={f.address} onChange={(e) => set('address', e.target.value)}
                  placeholder="House/Unit, Street, Barangay, City" />
                <p className="mt-1 text-[11px] text-[color:var(--mid-gray)]">Add a barangay and landmark so we can compute travel cost accurately.</p>
              </div>
              <div>
                <div className="label">Date of birth</div>
                <input type="date" className="input" value={f.dob} onChange={(e) => set('dob', e.target.value)} />
              </div>
              <div>
                <div className="label">Patient type <span className="text-[color:var(--clay)]">*</span></div>
                <select className="select" value={f.patientType} onChange={(e) => set('patientType', e.target.value)}>
                  <option value="ADULT">Adult</option>
                  <option value="PEDIATRIC">Pediatric</option>
                </select>
              </div>
            </div>

            {/* account */}
            <div className="mt-5 rounded-xl border border-[color:var(--paper-3)] bg-[color:var(--paper-2)]/50 p-4">
              <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-[color:var(--moss)]">Create your portal account</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Username" required value={f.username} onChange={(v) => set('username', v)} placeholder="lowercase letters, numbers" />
                <div className="hidden sm:block" />
                <Field label="Password" type="password" required value={f.password} onChange={(v) => set('password', v)} placeholder="min 8 characters" />
                <Field label="Confirm password" type="password" required value={f.confirm} onChange={(v) => set('confirm', v)} />
              </div>
            </div>

            {/* documents */}
            <div className="mt-5">
              <div className="label">Doctor's Referral <span className="text-[color:var(--clay)]">*</span> (required)</div>
              <input type="file" accept="image/*,application/pdf" className="input-file"
                onChange={async (e) => {
                  const file = e.target.files?.[0]; if (!file) return
                  try { setReferralFile(await fileToDataUrl(file)); setErr(null) } catch (er) { setErr(er instanceof Error ? er.message : 'Bad file') }
                }} />
              {referralFile && <p className="mt-1 text-[11px] text-[color:var(--moss)]">Attached: {referralFile.name}</p>}
              <div className="label mt-3">PWD / Senior ID (optional — for 20% discount eligibility)</div>
              <input type="file" accept="image/*,application/pdf" className="input-file"
                onChange={async (e) => {
                  const file = e.target.files?.[0]; if (!file) return
                  try { setPwdIdFile(await fileToDataUrl(file)) } catch (er) { setErr(er instanceof Error ? er.message : 'Bad file') }
                }} />
            </div>

            {/* optional extras */}
            <button onClick={() => setShowMore((v) => !v)} className="mt-4 text-[12px] text-[color:var(--moss)] hover:underline">
              {showMore ? '− Hide' : '+ Add'} optional details (sex, civil status, diagnosis…)
            </button>
            {showMore && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="label">Sex</div>
                  <select className="select" value={f.sex} onChange={(e) => set('sex', e.target.value)}>
                    <option value="">—</option><option>Male</option><option>Female</option>
                  </select>
                </div>
                <Field label="Civil status" value={f.civilStatus} onChange={(v) => set('civilStatus', v)} />
                <Field label="Religion" value={f.religion} onChange={(v) => set('religion', v)} />
                <Field label="Nationality" value={f.nationality} onChange={(v) => set('nationality', v)} />
                <Field label="PWD / Senior ID no." value={f.pwdSeniorId} onChange={(v) => set('pwdSeniorId', v)} />
                <Field label="Diagnosis / condition" value={f.diagnosis} onChange={(v) => set('diagnosis', v)} />
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button className="btn-cta" disabled={busy} onClick={goToPay}>{busy ? 'Checking…' : 'Continue → Review & pay'}</button>
            </div>
          </div>
        )}

        {/* ── STEP: pay ────────────────────────────────────────────────── */}
        {step === 'pay' && fare && day && (
          <div>
            <button onClick={() => setStep('details')} className="mb-3 text-[12px] text-[color:var(--moss)] hover:underline">← Edit details</button>
            <div className="rounded-2xl border border-[color:var(--paper-3)] bg-gradient-to-br from-[color:var(--paper-2)] to-white p-5">
              <div className="mb-3 text-[13px] text-[color:var(--mid-gray)]">
                {city?.name} · {branch ? branchLabel(branch) : ''} · {new Date(day.date).toLocaleDateString('en-PH', { weekday: 'long', month: 'short', day: 'numeric' })}{time ? ` · ${fmtTime(time)}` : ''}
              </div>
              <div className="space-y-1.5 text-[14px]">
                <Row label="Session fee" value={peso(fare.sessionFee)} />
                <Row label={`Transportation${fare.distanceKm != null ? ` (${fare.distanceKm.toFixed(1)} km)` : ''}`} value={peso(fare.baseTransport)} />
                {fare.surgeMultiplier > 1 && (
                  <Row label={`Peak surge ×${fare.surgeMultiplier}${fare.surgeLabel ? ` (${fare.surgeLabel})` : ''}`} value={peso(fare.transportFee - fare.baseTransport)} />
                )}
                <div className="my-2 h-px bg-[color:var(--paper-3)]" />
                <Row label="Total due now" value={peso(fare.total)} bold />
              </div>
              {fare.notes && <p className="mt-3 text-[11px] italic text-[color:var(--mid-gray)]">{fare.notes}</p>}
            </div>
            <p className="mt-3 text-[12px] text-[color:var(--mid-gray)]">You'll be redirected to PayMongo to complete payment securely. Your booking is confirmed once payment is received.</p>
            <div className="mt-5 flex justify-end">
              <button className="btn-cta" disabled={busy} onClick={payNow}>{busy ? 'Starting payment…' : `Pay ${peso(fare.total)} →`}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', required, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; placeholder?: string
}) {
  return (
    <div>
      <div className="label">{label} {required && <span className="text-[color:var(--clay)]">*</span>}</div>
      <input type={type} className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? 'font-semibold text-[color:var(--narra)]' : 'text-[color:var(--mid-gray)]'}>{label}</span>
      <span className={bold ? 'text-[18px] font-bold text-[color:var(--deep-teal)]' : 'text-[color:var(--narra)]'}>{value}</span>
    </div>
  )
}
