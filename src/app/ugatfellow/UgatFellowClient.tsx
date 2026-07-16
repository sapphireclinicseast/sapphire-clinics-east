'use client'

import { useEffect, useRef, useState } from 'react'
import s from './ugat.module.css'
import Portal, { type PortalSession } from './Portal'

const TOKEN_KEY = 'ugat_token'
const API = '/api/public/ugat'

const PH_REGIONS = [
  'NCR — National Capital Region',
  'CAR — Cordillera Administrative Region',
  'Region I — Ilocos Region',
  'Region II — Cagayan Valley',
  'Region III — Central Luzon',
  'Region IV-A — CALABARZON',
  'Region IV-B — MIMAROPA',
  'Region V — Bicol Region',
  'Region VI — Western Visayas',
  'Region VII — Central Visayas',
  'Region VIII — Eastern Visayas',
  'Region IX — Zamboanga Peninsula',
  'Region X — Northern Mindanao',
  'Region XI — Davao Region',
  'Region XII — SOCCSKSARGEN',
  'Region XIII — Caraga',
  'BARMM — Bangsamoro',
]

// ── The growing-leaf mark (shared by intro + headers) ──────────────
function LeafMark({ animated = false, className }: { animated?: boolean; className?: string }) {
  const p = animated
    ? { plant: s.plant, root: s.root_, rc: s.rootC, rl: s.rootL, rr: s.rootR, stem: s.stem, leaf: s.leaf, midrib: s.midrib }
    : { plant: '', root: '', rc: '', rl: '', rr: '', stem: '', leaf: '', midrib: '' }
  return (
    <svg className={className} viewBox="0 0 240 280" xmlns="http://www.w3.org/2000/svg" aria-label="UGAT living-leaf logo">
      <g transform="translate(120,130) scale(1.45)">
        <g className={p.plant}>
          <path className={`${p.root} ${p.rc}`} d="M0 56 L0 78" fill="none" stroke="#1B5E3A" strokeWidth="3.5" strokeLinecap="round" />
          <path className={`${p.root} ${p.rl}`} d="M0 56 C -8 64 -14 66 -22 78" fill="none" stroke="#1B5E3A" strokeWidth="3" strokeLinecap="round" />
          <path className={`${p.root} ${p.rr}`} d="M0 56 C 8 64 14 66 22 78" fill="none" stroke="#1B5E3A" strokeWidth="3" strokeLinecap="round" />
          <path className={p.stem} d="M0 56 L0 22" fill="none" stroke="#1B5E3A" strokeWidth="3.5" strokeLinecap="round" />
          <g className={p.leaf}>
            <path d="M0 -72 C 40 -42 40 2 0 22 C -40 2 -40 -42 0 -72 Z" fill="#2F7A4D" />
            <path d="M0 -72 C 40 -42 40 2 0 22 L0 -72 Z" fill="#4CAF6E" />
          </g>
          <line className={p.midrib} x1="0" y1="20" x2="0" y2="-62" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  )
}

type Tab = 'signin' | 'signup'
type View = 'auth' | 'checkEmail' | 'portal'

export default function UgatFellowClient() {
  const [showIntro, setShowIntro] = useState(true)
  const [introGone, setIntroGone] = useState(false)
  const [view, setView] = useState<View>('auth')
  const [tab, setTab] = useState<Tab>('signin')
  const [session, setSession] = useState<PortalSession | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [faqOpen, setFaqOpen] = useState(false)
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const [booted, setBooted] = useState(false)

  const [options, setOptions] = useState<{ schoolsAral: string[]; schoolsTindig: string[]; schools: string[]; programs: string[]; fields: string[] }>({
    schoolsAral: [], schoolsTindig: [], schools: [], programs: [], fields: [],
  })

  // ── Boot: intro timing, verify banner, restore session ───────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const verified = params.get('verified')
    const verifyError = params.get('verify_error')
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (verified) {
      setBanner({ kind: 'ok', msg: 'Your email is verified. You can now sign in.' })
      setTab('signin')
    } else if (verifyError) {
      const m =
        verifyError === 'expired' ? 'That verification link has expired. Sign in and request a new one below.'
        : 'We couldn’t verify that link. Try signing in, or resend the link below.'
      setBanner({ kind: 'err', msg: m })
      setTab('signin')
    }
    if (verified || verifyError) {
      window.history.replaceState({}, '', '/ugatfellow')
    }

    // Skip the intro if returning via a verify link or reduced motion.
    if (verified || verifyError || reduce) {
      setShowIntro(false); setIntroGone(true)
    } else {
      const t1 = setTimeout(() => setShowIntro(false), 3400)
      const t2 = setTimeout(() => setIntroGone(true), 4300)
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }
  }, [])

  // Restore an existing session (any role).
  useEffect(() => {
    const t = localStorage.getItem(TOKEN_KEY)
    if (!t) { setBooted(true); return }
    fetch(`${API}/session`, { headers: { Authorization: `Bearer ${t}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: PortalSession) => { setSession(d); setToken(t); setView('portal') })
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setBooted(true))
  }, [])

  // Load dropdown options for the signup form.
  useEffect(() => {
    fetch(`${API}/options`).then((r) => r.json()).then(setOptions).catch(() => {})
  }, [])

  // Called after a successful sign-in (any role). Stores the token, then
  // resolves the canonical session (role + scholar/admin) from the server.
  async function onAuthed(t: string) {
    localStorage.setItem(TOKEN_KEY, t)
    try {
      const r = await fetch(`${API}/session`, { headers: { Authorization: `Bearer ${t}` } })
      if (!r.ok) throw new Error()
      const d: PortalSession = await r.json()
      setSession(d); setToken(t); setView('portal')
    } catch {
      localStorage.removeItem(TOKEN_KEY)
      setBanner({ kind: 'err', msg: 'Signed in, but your session could not be loaded. Please try again.' })
    }
  }
  function logout() {
    localStorage.removeItem(TOKEN_KEY)
    setSession(null); setToken(null)
    setView('auth')
    setTab('signin')
  }

  return (
    <div className={s.root}>
      {!introGone && (
        <div className={`${s.intro} ${showIntro ? '' : s.introHidden}`} aria-hidden={!showIntro}>
          <div>
            <LeafMark animated className={s.introMark} />
            <div className={s.introWord}>
              <b>UGAT</b>
              <span>Fellowship Program</span>
            </div>
          </div>
        </div>
      )}

      {view === 'portal' && session && token ? (
        <Portal session={session} token={token} onLogout={logout} />
      ) : (
        <div className={`${s.split} ${introGone ? s.enter : ''}`}>
          <LeftPanel />
          <div className={s.right}>
            <div className={s.card}>
              <div className={s.mobileHead}>
                <LeafMark />
                <div>
                  <b>UGAT Fellowship</b>
                  <span>Fellowship Program</span>
                </div>
              </div>

              {banner && (
                <div className={`${s.alert} ${banner.kind === 'ok' ? s.alertOk : s.alertErr}`}>{banner.msg}</div>
              )}

              <AnnouncementBoard />

              {view === 'checkEmail' ? (
                <CheckEmail onBack={() => { setView('auth'); setTab('signin') }} />
              ) : (
                <>
                  <div className={s.faqRow}>
                    <button type="button" className={s.faqBtn} onClick={() => setFaqOpen(true)}>❓ Frequently Asked Questions</button>
                  </div>
                  <div className={s.tabs} role="tablist">
                    <button className={`${s.tab} ${tab === 'signin' ? s.tabActive : ''}`} onClick={() => { setTab('signin'); setBanner(null) }}>
                      Sign In
                    </button>
                    <button className={`${s.tab} ${tab === 'signup' ? s.tabActive : ''}`} onClick={() => { setTab('signup'); setBanner(null) }}>
                      Sign Up
                    </button>
                  </div>

                  {tab === 'signin' ? (
                    <SignIn onAuthed={onAuthed} booted={booted} />
                  ) : (
                    <SignUp
                      options={options}
                      openPrivacy={() => setPrivacyOpen(true)}
                      onRegistered={() => { setView('checkEmail') }}
                    />
                  )}
                </>
              )}

              <PrivacyStrip />

              {/* Program info for mobile (left panel is hidden < 900px). */}
              <div className={s.mobileProgram}>
                <p className={s.mobileProgramDesc}>
                  The UGAT Fellowship Program is an educational fellowship you never have to pay back — not a loan — for Allied Health
                  Professionals in their final year of university — helping fellows stay
                  grounded in their values (<i>ugat</i>) as they pursue excellence
                  (<i>galing</i>), integrity (<i>tindig</i>), and service (<i>paglilingkod</i>).
                </p>
                <ProgramTimeline />
                <p className={s.mobilePartner}>
                  Interested to have your school partner with us for accepting fellows for
                  Speech-Language Pathology or Occupational Therapy? Contact us at{' '}
                  <a href="mailto:scholarship@sapphireclinicseast.org">scholarship@sapphireclinicseast.org</a>.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {privacyOpen && <PrivacyModal onClose={() => setPrivacyOpen(false)} />}
      {faqOpen && <FaqModal onClose={() => setFaqOpen(false)} />}
    </div>
  )
}

// ── Left brand / program panel ─────────────────────────────────────
function LeftPanel() {
  return (
    <div className={s.left}>
      <div className={s.leftPhoto} />
      <div className={s.leftFade} />
      <div className={s.leftTop}>
        <LeafMark className={s.leftMark} />
        <div className={s.leftBrand}>
          <b>UGAT Fellowship</b>
          <span>Fellowship Program</span>
        </div>
      </div>
      <div className={s.leftBody}>
        <p className={s.leftKicker}>Ugnayan para sa Galing, Aral, at Tindig</p>
        <h1 className={s.leftTitle}>Rooted in values.<br />Growing in service.</h1>
        <p className={s.leftTagline}>A fellowship for the next generation of Allied Health Professionals.</p>
        <p className={s.leftDesc}>
          The UGAT Fellowship Program is an educational fellowship you never have to pay back — not a loan — for Allied Health
          Professionals in their final year of university. Much like strong roots
          (<i>ugat</i>), we hope our fellows stay firmly grounded in their values even
          as they grow — pursuing excellence (<i>galing</i>) in their craft, upholding
          honor and integrity (<i>tindig</i>) in their practice, and ultimately giving
          back through meaningful service (<i>paglilingkod</i>) to the community.
        </p>
        <ProgramTimeline />
        <p className={s.leftPartner}>
          Interested to have your school partner with us for accepting fellows for
          Speech-Language Pathology or Occupational Therapy? Contact us at{' '}
          <a href="mailto:scholarship@sapphireclinicseast.org">scholarship@sapphireclinicseast.org</a>.
        </p>
      </div>
    </div>
  )
}

// ── Application timeline (shared by desktop panel + mobile block) ───
function ProgramTimeline() {
  return (
    <div className={s.timeline}>
      <p className={s.timelineTitle}>📅 Typical cycle — the year at a glance</p>

      <p className={s.timelineCycle}>Cycle 1 <span>· Annual applicants</span></p>
      <div className={s.timelineRow}><span className={s.timelineWhen}>Jan – May</span><span>Applications open</span></div>
      <div className={s.timelineRow}><span className={s.timelineWhen}>Jun – Jul</span><span>Deliberations by our assessors</span></div>
      <div className={s.timelineRow}><span className={s.timelineWhen}>Jul – Aug</span><span>New fellows announced!</span></div>

      <p className={s.timelineCycle}>Cycle 2 <span>· Semestral applicants</span></p>
      <div className={s.timelineRow}><span className={s.timelineWhen}>Jun – Aug</span><span>Applications open</span></div>
      <div className={s.timelineRow}><span className={s.timelineWhen}>Oct – Nov</span><span>Deliberations by our assessors</span></div>
      <div className={s.timelineRow}><span className={s.timelineWhen}>Nov – Dec</span><span>New fellows announced!</span></div>

      <p className={s.timelineNote}>May have adjustments depending on the intake of fellows.</p>
    </div>
  )
}

// ── Announcement board (public; managed by admins in the portal) ────
interface Announcement { id: string; title: string; details: string; createdAt: string }

function AnnouncementBoard() {
  const [items, setItems] = useState<Announcement[] | null>(null)

  useEffect(() => {
    fetch(`${API}/announcements`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { announcements?: Announcement[] }) => setItems(d.announcements || []))
      .catch(() => setItems([]))
  }, [])

  if (!items || items.length === 0) return null

  return (
    <div className={s.annBoard}>
      <div className={s.annBoardHead}>
        <svg className={s.annBoardIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m3 11 18-5v12L3 14v-3z" />
          <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
        </svg>
        Announcements
      </div>
      {items.map((a) => (
        <div key={a.id} className={s.annItem}>
          <div className={s.annItemTitle}>{a.title}</div>
          <div className={s.annItemDetails}>{a.details}</div>
          <div className={s.annItemDate}>
            {new Date(a.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Sign In ────────────────────────────────────────────────────────
function SignIn({ onAuthed, booted }: { onAuthed: (t: string) => void | Promise<void>; booted: boolean }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [needsVerify, setNeedsVerify] = useState(false)
  const [resendMsg, setResendMsg] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null); setNeedsVerify(false); setResendMsg(null)
    try {
      const r = await fetch(`${API}/auth/sign-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const d = await r.json()
      if (!r.ok) {
        setErr(d.error || 'Could not sign in.')
        if (d.needsVerification) setNeedsVerify(true)
        return
      }
      await onAuthed(d.token)
    } catch {
      setErr('Network error. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    setResendMsg(null)
    try {
      await fetch(`${API}/auth/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })
      setResendMsg('If that account needs verification, a new link is on its way to your emails.')
    } catch {
      setResendMsg('Could not resend right now. Please try again shortly.')
    }
  }

  return (
    <form onSubmit={submit}>
      <h2 className={s.h1}>Welcome back</h2>
      <p className={s.sub}>Sign in to your UGAT Fellowship scholar account.</p>

      {err && <div className={`${s.alert} ${s.alertErr}`}>{err}</div>}
      {resendMsg && <div className={`${s.alert} ${s.alertOk}`}>{resendMsg}</div>}

      <div className={s.field}>
        <label className={s.label}>Username</label>
        <input className={s.input} type="text" autoComplete="username" required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="your.username" />
      </div>
      <div className={s.field}>
        <label className={s.label}>Password</label>
        <input className={s.input} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" />
      </div>

      <button className={s.btn} type="submit" disabled={busy || !booted}>
        {busy && <span className={s.spinner} />}Sign In
      </button>

      {needsVerify && (
        <div className={s.smallRow}>
          <span>Didn&rsquo;t get the email?</span>
          <button type="button" className={s.ghostBtn} onClick={resend}>Resend verification link</button>
        </div>
      )}
    </form>
  )
}

// ── Sign Up ────────────────────────────────────────────────────────
const emptyForm = {
  firstName: '', middleName: '', lastName: '',
  studentNumber: '', expectedGraduationYear: '', birthdate: '',
  school: '', program: '', preferredField: '',
  professionalEmail: '', personalEmail: '', username: '', password: '',
  permAddress1: '', permAddress2: '', permCity: '', permRegion: '', permZip: '',
  presAddress1: '', presAddress2: '', presCity: '', presRegion: '', presZip: '',
}

function SignUp({
  options,
  openPrivacy,
  onRegistered,
}: {
  options: { schoolsAral: string[]; schoolsTindig: string[]; schools: string[]; programs: string[]; fields: string[] }
  openPrivacy: () => void
  onRegistered: () => void
}) {
  const [f, setF] = useState({ ...emptyForm })
  const [sameAddr, setSameAddr] = useState(false)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const topRef = useRef<HTMLHeadingElement | null>(null)

  // Which track the applicant is registering for.
  const [track, setTrack] = useState<'ARAL' | 'TINDIG'>('ARAL')

  // Preferred field of practice is multi-select + an "Others" free-text.
  const [prefFields, setPrefFields] = useState<string[]>([])
  const [otherOn, setOtherOn] = useState(false)
  const [otherText, setOtherText] = useState('')
  const togglePref = (v: string) => setPrefFields((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]))

  const set = (k: keyof typeof emptyForm, v: string) => setF((p) => ({ ...p, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!consent) { setErr('Please read and agree to the Data Privacy Notice.'); return }
    const chosenFields = [...prefFields]
    if (otherOn && otherText.trim()) chosenFields.push(otherText.trim())
    if (chosenFields.length === 0) { setErr('Please choose at least one preferred field of practice.'); topRef.current?.scrollIntoView({ behavior: 'smooth' }); return }
    setBusy(true)
    try {
      const r = await fetch(`${API}/auth/sign-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...f,
          track,
          preferredField: chosenFields.join(', '),
          expectedGraduationYear: Number(f.expectedGraduationYear),
          presSameAsPerm: sameAddr,
          privacyConsent: consent,
        }),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Could not create your account.'); topRef.current?.scrollIntoView({ behavior: 'smooth' }); return }
      onRegistered()
    } catch {
      setErr('Network error. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const dropdown = (label: string, key: keyof typeof emptyForm, list: string[]) => (
    <div className={s.field}>
      <label className={s.label}>{label}</label>
      <select className={s.select} required value={f[key]} onChange={(e) => set(key, e.target.value)}>
        <option value="" disabled>Select…</option>
        {list.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )

  const addr = (prefix: 'perm' | 'pres', disabled = false) => (
    <>
      <div className={s.field}>
        <label className={s.label}>Address Line 1</label>
        <input className={s.input} required disabled={disabled} value={f[`${prefix}Address1` as keyof typeof emptyForm]} onChange={(e) => set(`${prefix}Address1` as keyof typeof emptyForm, e.target.value)} placeholder="House no., street, barangay" />
      </div>
      <div className={s.field}>
        <label className={s.label}>Address Line 2 <span className={s.opt}>(optional)</span></label>
        <input className={s.input} disabled={disabled} value={f[`${prefix}Address2` as keyof typeof emptyForm]} onChange={(e) => set(`${prefix}Address2` as keyof typeof emptyForm, e.target.value)} placeholder="Subdivision, building, unit" />
      </div>
      <div className={s.grid2}>
        <div className={s.field}>
          <label className={s.label}>Municipality / City</label>
          <input className={s.input} required disabled={disabled} value={f[`${prefix}City` as keyof typeof emptyForm]} onChange={(e) => set(`${prefix}City` as keyof typeof emptyForm, e.target.value)} />
        </div>
        <div className={s.field}>
          <label className={s.label}>Zip Code</label>
          <input className={s.input} required disabled={disabled} inputMode="numeric" value={f[`${prefix}Zip` as keyof typeof emptyForm]} onChange={(e) => set(`${prefix}Zip` as keyof typeof emptyForm, e.target.value)} />
        </div>
      </div>
      <div className={s.field}>
        <label className={s.label}>Region</label>
        <select className={s.select} required disabled={disabled} value={f[`${prefix}Region` as keyof typeof emptyForm]} onChange={(e) => set(`${prefix}Region` as keyof typeof emptyForm, e.target.value)}>
          <option value="" disabled>Select region…</option>
          {PH_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
    </>
  )

  return (
    <form onSubmit={submit}>
      <h2 className={s.h1} ref={topRef}>Create your account</h2>
      <p className={s.sub}>Register as an incoming UGAT fellow. We&rsquo;ll email you a link to verify your address.</p>

      {err && <div className={`${s.alert} ${s.alertErr}`}>{err}</div>}

      <div className={s.field}>
        <label className={s.label}>Which track are you registering for?</label>
        <div className={s.checkGrid}>
          <button type="button" className={`${s.checkPill} ${track === 'ARAL' ? s.checkPillOn : ''}`} onClick={() => setTrack('ARAL')}><span><b>Aral Track</b> — final-year intern</span></button>
          <button type="button" className={`${s.checkPill} ${track === 'TINDIG' ? s.checkPillOn : ''}`} onClick={() => setTrack('TINDIG')}><span><b>Tindig Track</b> — graduate (licensure review)</span></button>
        </div>
      </div>

      <div className={s.grid2}>
        <div className={s.field}>
          <label className={s.label}>First Name</label>
          <input className={s.input} required value={f.firstName} onChange={(e) => set('firstName', e.target.value)} />
        </div>
        <div className={s.field}>
          <label className={s.label}>Middle Name <span className={s.opt}>(optional)</span></label>
          <input className={s.input} value={f.middleName} onChange={(e) => set('middleName', e.target.value)} />
        </div>
      </div>
      <div className={s.field}>
        <label className={s.label}>Last Name</label>
        <input className={s.input} required value={f.lastName} onChange={(e) => set('lastName', e.target.value)} />
      </div>
      <div className={s.grid2}>
        <div className={s.field}>
          <label className={s.label}>Student Number</label>
          <input className={s.input} required value={f.studentNumber} onChange={(e) => set('studentNumber', e.target.value)} />
        </div>
        <div className={s.field}>
          <label className={s.label}>{track === 'TINDIG' ? 'Year of Graduation' : 'Expected Year of Graduation'}</label>
          <input className={s.input} required inputMode="numeric" placeholder={track === 'TINDIG' ? 'e.g. 2026' : 'e.g. 2027'} value={f.expectedGraduationYear} onChange={(e) => set('expectedGraduationYear', e.target.value)} />
        </div>
      </div>
      <div className={s.field}>
        <label className={s.label}>Birthdate</label>
        <input className={s.input} type="date" required value={f.birthdate} onChange={(e) => set('birthdate', e.target.value)} />
      </div>

      {dropdown('School', 'school', track === 'TINDIG' ? options.schoolsTindig : options.schoolsAral)}
      {dropdown('Program', 'program', options.programs)}

      <div className={s.sectionLabel}>Permanent Address</div>
      {addr('perm')}

      <div className={s.sectionLabel}>Present Address</div>
      <label className={s.check}>
        <input type="checkbox" checked={sameAddr} onChange={(e) => setSameAddr(e.target.checked)} />
        <span>Same as Permanent Address</span>
      </label>
      {!sameAddr && addr('pres')}

      <div className={s.sectionLabel}>Practice &amp; Account</div>
      <div className={s.field}>
        <label className={s.label}>Preferred Field of Practice <span className={s.opt}>(choose one or more)</span></label>
        <div className={s.checkGrid}>
          {options.fields.map((o) => (
            <label key={o} className={`${s.checkPill} ${prefFields.includes(o) ? s.checkPillOn : ''}`}>
              <input type="checkbox" checked={prefFields.includes(o)} onChange={() => togglePref(o)} />
              <span>{o}</span>
            </label>
          ))}
          <label className={`${s.checkPill} ${otherOn ? s.checkPillOn : ''}`}>
            <input type="checkbox" checked={otherOn} onChange={(e) => setOtherOn(e.target.checked)} />
            <span>Others</span>
          </label>
        </div>
        {otherOn && (
          <input className={s.input} style={{ marginTop: 8 }} placeholder="Please specify your other specialization(s)" value={otherText} onChange={(e) => setOtherText(e.target.value)} />
        )}
      </div>
      <div className={s.field}>
        <label className={s.label}>Professional Email <span className={s.opt}>(school / work)</span></label>
        <input className={s.input} type="email" autoComplete="email" required value={f.professionalEmail} onChange={(e) => set('professionalEmail', e.target.value)} placeholder="you@school.edu.ph" />
      </div>
      <div className={s.field}>
        <label className={s.label}>Personal Email</label>
        <input className={s.input} type="email" required value={f.personalEmail} onChange={(e) => set('personalEmail', e.target.value)} placeholder="you@example.com" />
      </div>
      <div className={s.field}>
        <label className={s.label}>Username <span className={s.opt}>(you&rsquo;ll sign in with this)</span></label>
        <input className={s.input} type="text" autoComplete="username" required value={f.username} onChange={(e) => set('username', e.target.value)} placeholder="3–30 chars: letters, numbers, . _ -" />
      </div>
      <div className={s.field}>
        <label className={s.label}>Password <span className={s.opt}>(min. 8 characters)</span></label>
        <input className={s.input} type="password" autoComplete="new-password" required minLength={8} value={f.password} onChange={(e) => set('password', e.target.value)} />
      </div>

      <label className={s.check}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          I have read and agree to the{' '}
          <button type="button" className={s.linkBtn} onClick={openPrivacy}>Data Privacy Notice</button>, and I
          consent to SCEI collecting and processing my personal data for the UGAT Fellowship Program.
        </span>
      </label>

      <button className={s.btn} type="submit" disabled={busy}>
        {busy && <span className={s.spinner} />}Create Account
      </button>
    </form>
  )
}

// ── Check-email panel ──────────────────────────────────────────────
function CheckEmail({ onBack }: { onBack: () => void }) {
  return (
    <div className={s.panelCenter}>
      <div className={s.checkIcon}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
      </div>
      <h2 className={s.h1}>Check your email</h2>
      <p className={s.sub}>
        We&rsquo;ve sent a verification link to your <b>professional and personal email</b> from{' '}
        <b>scholarship@sapphireclinicseast.org</b>. Click it to activate your account, then come back here to sign in with your username.
      </p>
      <button className={s.btn} onClick={onBack}>Back to Sign In</button>
    </div>
  )
}

// ── NPC / privacy compliance strip ─────────────────────────────────
function PrivacyStrip() {
  return (
    <div className={s.privacyStrip}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={s.privacySeal} src="/ugat/npc-seal.png" alt="National Privacy Commission — Registered (Data Privacy Seal)" />
      <p className={s.privacyText}>
        <b>Sapphire Clinics East, Inc.</b> is compliant with the <b>Data Privacy Act of 2012</b> and registered
        with the <b>National Privacy Commission</b>. Your data is collected and processed lawfully and securely.
      </p>
    </div>
  )
}


// ── Frequently Asked Questions modal ───────────────────────────────
const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: 'What is the difference between the Aral Track and the Tindig Track?',
    a: <>The fellowship has two tracks. The <b>Aral Track</b> is for <b>final-year interns</b> still undergoing their clinical internship — fellowship assistance released as a monthly allowance (₱5,000 or ₱10,000) for 5–10 months. The <b>Tindig Track</b> is for <b>graduates preparing for the Licensure Examination</b> who have completed their internship and were not Aral awardees — ₱30,000 of review support (review fees, or ₱5,000/month for six months). It is <b>educational assistance — not a loan, and never charged interest</b>, and it is <b>fully forgivable</b>: after you are licensed, render <b>1,500 patient-session hours</b> with us and it is written off in full — you pay nothing. When you apply, you&rsquo;ll first choose the track that fits you.</>,
  },
  {
    q: 'I am not yet in my final year of college. Can I apply?',
    a: <>Not yet — the <b>Aral Track</b> is open to students in their <b>final (internship) year</b>, and the <b>Tindig Track</b> is for graduates preparing for the licensure exam. If you&rsquo;re earlier in your studies, you are still very welcome to <b>create an account now</b> so you&rsquo;ll be among the first notified when the next cycle opens, and can apply the moment you become eligible.</>,
  },
  {
    q: 'I have failing grades in my records. Can I still apply?',
    a: <>Yes, you can. UGAT recognizes that it takes more than grades to make a great clinician. Our application includes <b>qualitative components</b> — your motivations, values, and past initiatives — that help us understand the whole person behind the transcript when deciding who to award.</>,
  },
  {
    q: 'What happens if I am unable to complete my internship?',
    a: <>If you cannot continue or complete your clinical internship for any reason, your monthly allowance simply stops as of that date. Because you would not yet proceed to licensure, you (together with your co-maker) would reimburse <b>only what you actually received</b> up to that point — in equal monthly installments, <b>with no interest and no charges</b> — commencing <b>90 days</b> from discontinuance. Full payment completely and finally settles the agreement, with no further obligation on either side. SCEI handles each case fairly and with compassion, and may waive, reduce, or restructure this — especially in cases of serious illness, a death in the immediate family, or other circumstances beyond your control — and may, once you are licensed, let you have the balance forgiven through service instead.</>,
  },
  {
    q: 'Does the fellowship require a co-maker?',
    a: <>Yes. A <b>co-maker</b> is a parent or guardian, of legal age, who co-signs your <b>UGAT Fellowship Agreement</b> and agrees to be <b>jointly and severally liable</b> with you for any monetary obligations that may arise under it — for example, reimbursement of the assistance actually received (and, only if there is an uncured default, legal interest and a one-time 5% liquidated-damages charge) — should you be unable to fulfill the terms. In practice, the co-maker is a trusted family member who stands with you in your commitment. If the assistance is forgiven through your service, the co-maker&rsquo;s liability is extinguished along with yours — nothing is owed.</>,
  },
  {
    q: 'Do I have obligations after availing of the fellowship?',
    a: <>After you are licensed, you settle it one of two ways. <b>Option A — render your service:</b> render <b>1,500 patient-session hours</b> at <b>Aura Health Rehab</b> as a fully-compensated licensed clinician (beginning within <b>60 days</b> of receiving your license) and the entire assistance is <b>forgiven</b> — you pay nothing. <b>Option B — Reimbursement:</b> reimburse <b>only what you actually received</b>, in equal monthly installments, with <b>no interest and no charges of any kind</b>. Service is never compelled; Option A is simply the path designed to cost you nothing. Because service is rendered on-site, please make sure you can reach and work at Aura Health Rehab&rsquo;s clinic locations.</>,
  },
  {
    q: 'If I render service at the accredited partner clinics, is my professional compensation deducted?',
    a: <>No. Under Option A, the service is fulfilled through the <b>hours you actually work — not through any salary deduction</b>, and you are fully and separately compensated for that work. In practice, you simply report for your regular clinical schedule (about five days a week) at an accredited partner clinic until the 1,500 hours are completed. <br /><br />As a rough estimate, at about <b>six patient sessions a day, five days a week</b> — roughly 30 hours a week, or about 130 hours a month — you would complete the 1,500 hours in approximately <b>11 to 12 months</b> (a little under a year). Your actual pace depends on your caseload and schedule.</>,
  },
  {
    q: 'When does the stipend start to be released?',
    a: <>Your stipend is remitted <b>on or before the 10th day of each month</b> of your internship period — starting in the first month of your internship and every month thereafter for the duration of the award.</>,
  },
  {
    q: 'How will the stipend be released to me?',
    a: <>The stipend is <b>deposited directly to your nominated bank account</b> — please make sure the account can <b>accept check deposits</b>. It is <b>no longer coursed through the partner university</b>, so that you can access and use the stipend at the actual time you need it.</>,
  },
  {
    q: 'My school is not yet included in the list of partner schools. Can I still apply?',
    a: <>It depends on your track. The <b>Aral Track</b> (for current final-year interns) is coursed through your University, so it is open to our <b>partner schools</b> — you may ask your <b>College</b> or <b>Office of Student Relations</b> to partner with us. The <b>Tindig Track</b> (for graduates preparing for the licensure exam) has <b>no partner-school requirement</b>: as long as you are a <b>graduate of an SLP or OT program we accept fellows in</b>, you may apply <b>directly to SCEI</b>. Either way, feel free to write to us at <a href="mailto:scholarship@sapphireclinicseast.org">scholarship@sapphireclinicseast.org</a> and we&rsquo;ll be glad to help.</>,
  },
]
function FaqModal({ onClose }: { onClose: () => void }) {
  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={s.modalHead}>
          <h2>Frequently Asked Questions</h2>
          <p>UGAT Fellowship Program · Sapphire Clinics East, Inc.</p>
        </div>
        <div className={s.modalBody}>
          {FAQS.map((f, i) => (
            <div key={i} style={{ marginBottom: 18 }}>
              <h3>{f.q}</h3>
              <p>{f.a}</p>
            </div>
          ))}
        </div>
        <div className={s.modalFoot}>
          <button className={`${s.btn} ${s.btnGhost2}`} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

// ── Data Privacy Notice modal (NPC-aligned) ────────────────────────
function PrivacyModal({ onClose }: { onClose: () => void }) {
  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={s.modalHead}>
          <h2>Data Privacy Notice</h2>
          <p>UGAT Fellowship Program · Sapphire Clinics East, Inc.</p>
        </div>
        <div className={s.modalBody}>
          <p>
            Sapphire Clinics East, Inc. (&ldquo;SCEI&rdquo;) respects your
            right to privacy and is committed to protecting your personal data in accordance with the
            <b> Data Privacy Act of 2012 (Republic Act No. 10173)</b>, its Implementing Rules and
            Regulations, and the issuances of the National Privacy Commission (NPC).
          </p>

          <h3>Information we collect</h3>
          <p>To evaluate and administer your application to the UGAT Fellowship Program, we collect:</p>
          <ul>
            <li>Identity details — full name, birthdate, and student number;</li>
            <li>Academic details — school, program, and expected year of graduation;</li>
            <li>Contact details — email address and your permanent and present addresses;</li>
            <li>Professional interest — your preferred field of practice;</li>
            <li>Account credentials needed to secure your access to this hub.</li>
          </ul>

          <h3>Why we collect it</h3>
          <ul>
            <li>To assess eligibility for and administer the fellowship and its monthly stipend;</li>
            <li>To verify your identity and enrollment status;</li>
            <li>To communicate with you about your application, requirements, and program activities;</li>
            <li>To comply with legal, audit, and legitimate reporting obligations.</li>
          </ul>

          <h3>Legal basis</h3>
          <p>
            We process your data based on your <b>consent</b> and on our legitimate interest in
            administering the fellowship. You may withdraw consent at any time, subject to legal and
            contractual limits.
          </p>

          <h3>Sharing and disclosure</h3>
          <p>
            Your data is treated as confidential and accessed only by authorized SCEI
            personnel. We do not sell your data. We may share it with your school or with service
            providers (e.g., for stipend disbursement) strictly as necessary and under appropriate
            confidentiality and data-sharing safeguards, or when required by law.
          </p>

          <h3>Storage, retention, and security</h3>
          <p>
            Your data is stored on secured systems and retained only for as long as necessary for the
            purposes above or as required by law, after which it is securely disposed of. We apply
            organizational, physical, and technical measures to protect it against unauthorized access,
            loss, or misuse.
          </p>

          <h3>Your rights</h3>
          <p>Under the Data Privacy Act, you have the right to be informed, to access, to object, to
            rectify, to erasure or blocking, to data portability, to damages, and to lodge a complaint
            with the National Privacy Commission.</p>

          <h3>Contact us</h3>
          <p>
            For questions or to exercise your rights, contact our Data Protection Officer at{' '}
            <b>scholarship@sapphireclinicseast.org</b>.
          </p>
        </div>
        <div className={s.modalFoot}>
          <button className={`${s.btn} ${s.btnGhost2}`} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
