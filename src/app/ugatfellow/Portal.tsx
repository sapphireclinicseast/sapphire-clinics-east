'use client'

// The authenticated UGAT hub: a role-gated left sidebar + section content.
// One shell serves scholars, admins, and university admins; SECTIONS[].roles
// decides visibility. University admins get a read-only About Us + Application.

import { useCallback, useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import {
  Info, User, FileText, LayoutDashboard, GraduationCap, Settings as SettingsIcon,
  ShieldCheck, LogOut, Menu, X, CheckCircle2, Ban, Trash2, Plus, ChevronDown, Upload, Eye, EyeOff, Calendar, Mail, Megaphone,
} from 'lucide-react'
import s from './ugat.module.css'

const API = '/api/public/ugat'
const QUESTION_MAX = 1500
const LETTER_MAX_WORDS = 900

type Role = 'MAIN_ADMIN' | 'STAFF_ADMIN' | 'UNIVERSITY_ADMIN' | 'SCHOLAR'

export interface AppData {
  track?: string
  q1WhyApply?: string | null; q2Initiatives?: string | null; q3WhyProgram?: string | null
  q4StipendUse?: string | null; q5ReturnService?: string | null; q6ArawNgKalinga?: string | null
  q7FiveYearPlan?: string | null
  truthAffirmed?: boolean; signedAt?: string | null; submittedAt?: string | null
  academicYear?: string | null
  initialDecision?: string
  interviewAt?: string | null; interviewDurationMins?: number | null; jitsiUrl?: string | null
  interviewSlotId?: string | null; interviewDecision?: string
}
export interface PortalScholar {
  id: string; username: string; track?: string; professionalEmail: string; personalEmail: string
  firstName: string; middleName?: string | null; lastName: string; studentNumber: string
  birthdate?: string; school: string; program: string; preferredField: string
  expectedGraduationYear: number; status: string; photoId?: string | null
  awardMonthly?: number | null; awardMonths?: number | null
  permAddress1: string; permAddress2?: string | null; permCity: string; permRegion: string; permZip: string
  presAddress1: string; presAddress2?: string | null; presCity: string; presRegion: string; presZip: string
}
export interface PortalAdmin { username: string; name: string }
export interface PortalSession {
  role: Role
  scholar?: PortalScholar
  application?: AppData | null
  uploadKinds?: Record<string, string>
  admin?: PortalAdmin
}

type SectionKey = 'about' | 'profile' | 'application' | 'dashboard' | 'schools' | 'announce' | 'settings' | 'access'

const SECTIONS: { key: SectionKey; label: string; icon: React.ElementType; roles: Role[] }[] = [
  { key: 'about', label: 'About Us', icon: Info, roles: ['SCHOLAR', 'STAFF_ADMIN', 'MAIN_ADMIN', 'UNIVERSITY_ADMIN'] },
  { key: 'profile', label: 'Profile', icon: User, roles: ['SCHOLAR', 'STAFF_ADMIN', 'MAIN_ADMIN'] },
  { key: 'application', label: 'Application', icon: FileText, roles: ['SCHOLAR', 'STAFF_ADMIN', 'MAIN_ADMIN', 'UNIVERSITY_ADMIN'] },
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['STAFF_ADMIN', 'MAIN_ADMIN'] },
  { key: 'schools', label: 'Schools Data', icon: GraduationCap, roles: ['SCHOLAR', 'STAFF_ADMIN', 'MAIN_ADMIN'] },
  { key: 'announce', label: 'Announcements', icon: Megaphone, roles: ['STAFF_ADMIN', 'MAIN_ADMIN'] },
  { key: 'settings', label: 'Settings', icon: SettingsIcon, roles: ['STAFF_ADMIN', 'MAIN_ADMIN'] },
  { key: 'access', label: 'User Access', icon: ShieldCheck, roles: ['STAFF_ADMIN', 'MAIN_ADMIN'] },
]

async function fileToBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).replace(/^data:[^;]+;base64,/, ''))
    r.onerror = reject
    r.readAsDataURL(f)
  })
}

export default function Portal({
  session, token, onLogout,
}: { session: PortalSession; token: string; onLogout: () => void }) {
  const role = session.role
  const allowed = useMemo(() => SECTIONS.filter((sec) => sec.roles.includes(role)), [role])
  const [active, setActive] = useState<SectionKey>(allowed[0]?.key || 'about')
  const [navOpen, setNavOpen] = useState(false)

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    [token],
  )

  const isAdmin = role === 'MAIN_ADMIN' || role === 'STAFF_ADMIN' || role === 'UNIVERSITY_ADMIN'
  const displayName = isAdmin ? (session.admin?.name || 'Administrator') : (session.scholar?.firstName || 'Scholar')
  const handle = isAdmin ? session.admin?.username : session.scholar?.username
  const roleLabel = role === 'MAIN_ADMIN' ? 'Main Admin' : role === 'STAFF_ADMIN' ? 'Staff Admin'
    : role === 'UNIVERSITY_ADMIN' ? 'University Admin' : 'Scholar'

  return (
    <div className={s.portal}>
      {navOpen && <div className={s.navScrim} onClick={() => setNavOpen(false)} />}
      <aside className={`${s.side} ${navOpen ? s.sideOpen : ''}`}>
        <div className={s.sideBrand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ugat/ugat-mark.svg" alt="" className={s.sideMark} />
          <div className={s.sideBrandText}><b>UGAT Fellowship</b><span>Fellowship Program</span></div>
          <button className={s.sideClose} onClick={() => setNavOpen(false)} aria-label="Close menu"><X size={20} /></button>
        </div>
        <nav className={s.sideNav}>
          {allowed.map((sec) => {
            const Icon = sec.icon
            return (
              <button key={sec.key} className={`${s.navItem} ${active === sec.key ? s.navItemActive : ''}`}
                onClick={() => { setActive(sec.key); setNavOpen(false) }}>
                <Icon size={18} strokeWidth={2} /><span>{sec.label}</span>
              </button>
            )
          })}
        </nav>
        <div className={s.sideFoot}>
          <div className={s.sideUser}>
            <div className={s.sideAvatar}>{displayName.charAt(0).toUpperCase()}</div>
            <div className={s.sideUserText}><b>{displayName}</b><span>{roleLabel}{handle ? ` · @${handle}` : ''}</span></div>
          </div>
          <button className={s.signOut} onClick={onLogout}><LogOut size={16} /> Sign out</button>
        </div>
      </aside>

      <main className={s.main}>
        <header className={s.mainBar}>
          <button className={s.hamburger} onClick={() => setNavOpen(true)} aria-label="Open menu"><Menu size={22} /></button>
          <h1 className={s.mainTitle}>{allowed.find((x) => x.key === active)?.label}</h1>
        </header>
        <div className={s.mainScroll}>
          {active === 'about' && <AboutUs />}
          {active === 'profile' && <Profile session={session} token={token} authHeaders={authHeaders} />}
          {active === 'application' && (
            role === 'SCHOLAR'
              ? <ScholarApplication session={session} token={token} authHeaders={authHeaders} />
              : <AdminApplication token={token} authHeaders={authHeaders} readOnly={role === 'UNIVERSITY_ADMIN'} onGoTo={setActive} />
          )}
          {active === 'dashboard' && <Dashboard authHeaders={authHeaders} />}
          {active === 'schools' && <SchoolsData />}
          {active === 'announce' && <AnnouncementsAdmin authHeaders={authHeaders} />}
          {active === 'settings' && <SettingsSection authHeaders={authHeaders} />}
          {active === 'access' && <UserAccess role={role} authHeaders={authHeaders} />}
        </div>
      </main>
    </div>
  )
}

// ══ About Us ═══════════════════════════════════════════════════════
function AboutUs() {
  return (
    <div className={s.sec}>
      <div className={s.aboutHero}>
        <div className={s.aboutHeroBody}>
          <p className={s.aboutKicker}>Ugnayan para sa Galing, Aral, at Tindig</p>
          <h2 className={s.aboutH1}>Grow where your roots are honored.</h2>
          <p className={s.aboutLead}>
            The <b>UGAT Fellowship Program</b> is a fellowship for aspiring
            Allied Health Professionals — Speech-Language Pathology and Occupational Therapy — offered
            in two tracks: the <b>Aral Track</b> for final-year interns and the <b>Tindig Track</b> for
            graduates preparing for the licensure exam. It walks with you from training and review all the
            way into your first years as a licensed professional.
          </p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={s.aboutHeroMark} src="/ugat/ugat-mark.svg" alt="" aria-hidden="true" />
      </div>
      <div className={s.aboutGrid}>
        <div className={s.aboutCard}><h3>Two tracks of support</h3><p><b>Aral Track</b> (final-year interns): a monthly allowance of <b>₱5,000 or ₱10,000</b> for up to ten months during your internship. <b>Tindig Track</b> (graduates): a <b>₱30,000</b> review-support grant toward your licensure — review fees, or ₱5,000/month for six months. Every fellow, in either track, renders the same <b>1,500 hours</b> of return service after licensure.</p></div>
        <div className={s.aboutCard}><h3>Mentorship at Aura Health Rehab</h3><p>Upon receiving your license, you will receive additional mentorship training alongside our senior therapists across Aura Health Rehab&rsquo;s <b>East</b> and <b>Greenhills</b> branches — real caseloads, real supervision, and a team invested in your craft (<i>galing</i>).</p></div>
        <div className={s.aboutCard}><h3>A guaranteed runway into your career</h3><p>After you pass your licensure, you give back through <b>return service</b> — practicing as a fully-compensated licensed clinician at Aura. It&rsquo;s not a deduction; it&rsquo;s a head start: a place waiting for you the day you become licensed.</p></div>
        <div className={s.aboutCard}><h3>Values that stay grounded</h3><p>Much like strong roots (<i>ugat</i>), we hope our fellows stay grounded in their values as they grow — pursuing excellence (<i>galing</i>), upholding integrity (<i>tindig</i>), and giving back through service (<i>paglilingkod</i>).</p></div>
      </div>
      <div className={s.aboutNote}>
        <h3>How the fellowship works</h3>
        <ol className={s.aboutSteps}>
          <li><b>Aral Track</b> — for qualified final-year SLP and OT interns, coursed through your University; a monthly allowance supports you through your internship.</li>
          <li><b>Tindig Track</b> — for graduates who&rsquo;ve completed their internship and are preparing for the licensure exam; a review-support grant (applied for directly to SCEI) covers review fees or a monthly review stipend.</li>
          <li>Upon licensure, every fellow renders return-service clinical hours at Aura as a licensed, fully-paid professional — with a Certificate of Completion and the option to stay on.</li>
          <li>Fellows are also expected to <b>actively participate in &ldquo;Araw ng Kalinga&rdquo;</b> — a one-day annual event by Sapphire Clinics East, Inc. that provides free therapy screening and medical services in partnership with a local government unit (LGU) or NGO, as our shared opportunity to give back to the community (<i>paglilingkod</i>).</li>
          <li>Handled with fairness and compassion, consistent with the <b>Data Privacy Act of 2012</b>.</li>
        </ol>
        <p className={s.aboutTimeline}><b>Applications</b> accepted January–April · <b>deliberations</b> May–June · <b>scholars announced</b> July. Extensions are usually announced.</p>
      </div>
      <div className={s.aboutPartner}>Interested to have your school partner with us for accepting fellows for Speech-Language Pathology or Occupational Therapy? Contact us at <a href="mailto:scholarship@sapphireclinicseast.org">scholarship@sapphireclinicseast.org</a>.</div>
    </div>
  )
}

// ══ Profile ════════════════════════════════════════════════════════
const STATUS_LABEL: Record<string, string> = { APPLIED: 'Applied', ACCEPTED: 'Accepted', WAITLISTED: 'Waitlisted', REJECTED: 'Not selected' }
const STATUS_CLASS: Record<string, string> = { APPLIED: s.stApplied, ACCEPTED: s.stAccepted, WAITLISTED: s.stWait, REJECTED: s.stRejected }

function Profile({ session, token, authHeaders }: { session: PortalSession; token: string; authHeaders: Record<string, string> }) {
  if (session.role === 'SCHOLAR' && session.scholar) return <ScholarProfile scholar={session.scholar} token={token} />
  return <AdminStudentList token={token} authHeaders={authHeaders} />
}

function ScholarProfile({ scholar, token }: { scholar: PortalScholar; token: string }) {
  const [photoId, setPhotoId] = useState<string | null>(scholar.photoId || null)
  const [ver, setVer] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    setErr(null); setBusy(true)
    try {
      const dataBase64 = await fileToBase64(f)
      const r = await fetch(`${API}/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'PHOTO', filename: f.name, mimeType: f.type, dataBase64 }) })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Upload failed.'); return }
      setPhotoId(d.id); setVer((v) => v + 1)
    } catch { setErr('Upload failed.') } finally { setBusy(false) }
  }

  const fullName = [scholar.firstName, scholar.middleName, scholar.lastName].filter(Boolean).join(' ')
  const perm = [scholar.permAddress1, scholar.permAddress2, scholar.permCity, scholar.permRegion, scholar.permZip].filter(Boolean).join(', ')
  const pres = [scholar.presAddress1, scholar.presAddress2, scholar.presCity, scholar.presRegion, scholar.presZip].filter(Boolean).join(', ')
  const isTindig = scholar.track === 'TINDIG'
  const rows: [string, string | number][] = [
    ['Full name', fullName], ['Username', '@' + scholar.username], ['Track', TRACK_LABEL[scholar.track || 'ARAL']],
    ['Student number', scholar.studentNumber],
    ['School', scholar.school], ['Program', scholar.program], ['Preferred field of practice', scholar.preferredField],
    [isTindig ? 'Year of graduation' : 'Expected graduation', scholar.expectedGraduationYear], ['Professional email', scholar.professionalEmail],
    ['Personal email', scholar.personalEmail], ['Permanent address', perm], ['Present address', pres],
  ]
  const photoSrc = photoId ? `${API}/uploads/${photoId}?t=${token}&v=${ver}` : null

  return (
    <div className={s.sec}>
      <div className={s.card2}>
        <h3 className={s.card2H}>Your professional photo</h3>
        <div className={s.photoRow}>
          <div className={s.photoFrame}>
            {photoSrc
              ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={photoSrc} alt="Your profile" />
              : <User size={40} strokeWidth={1.4} />}
          </div>
          <div>
            <p className={s.muted}>Upload a clear, professional headshot (JPG, PNG or WebP). It appears on your profile and in the applicant list.</p>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onPhoto} />
            <button className={s.btn2} disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={16} /> {busy ? 'Uploading…' : photoSrc ? 'Replace photo' : 'Upload photo'}</button>
            {err && <div className={`${s.alert2} ${s.alertErr2}`} style={{ marginTop: 10 }}>{err}</div>}
          </div>
        </div>
      </div>
      <div className={s.card2}>
        <h3 className={s.card2H}>Your details</h3>
        <p className={s.muted}>To correct any of this, contact <a href="mailto:scholarship@sapphireclinicseast.org">scholarship@sapphireclinicseast.org</a>.</p>
        <dl className={s.defList}>{rows.map(([k, v]) => <div key={k} className={s.defRow}><dt>{k}</dt><dd>{v || '—'}</dd></div>)}</dl>
      </div>
    </div>
  )
}

interface AcceptanceData {
  contractSentAt?: string | null
  comakerFirstName?: string | null; comakerMiddleName?: string | null; comakerLastName?: string | null
  comakerBirthdate?: string | null; comakerEmail?: string | null; comakerOccupation?: string | null
  cmPermAddress1?: string | null; cmPermAddress2?: string | null; cmPermCity?: string | null; cmPermRegion?: string | null; cmPermZip?: string | null
  cmPresSameAsPerm?: boolean
  cmPresAddress1?: string | null; cmPresAddress2?: string | null; cmPresCity?: string | null; cmPresRegion?: string | null; cmPresZip?: string | null
  cmOccAddress1?: string | null; cmOccAddress2?: string | null; cmOccCity?: string | null; cmOccRegion?: string | null; cmOccZip?: string | null
  truthAffirmed?: boolean; softCopySignedAt?: string | null; hardCopySignedAt?: string | null
}
interface AdminScholar {
  id: string; username: string; track?: string; professionalEmail: string; personalEmail: string
  firstName: string; middleName?: string | null; lastName: string; studentNumber: string
  school: string; program: string; preferredField: string; expectedGraduationYear: number
  awardMonthly?: number | null; awardMonths?: number | null
  status: string; age: number | null; permCity: string; photoId: string | null
  uploadKinds: Record<string, string>; application: AppData | null; acceptance?: AcceptanceData | null
  passwordPlain?: string | null
  emailVerifiedAt?: string | null; disabledAt?: string | null; createdAt: string
}

function useScholars(authHeaders: Record<string, string>) {
  const [rows, setRows] = useState<AdminScholar[] | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const load = useCallback(async () => {
    const r = await fetch(`${API}/scholars`, { headers: authHeaders })
    if (r.ok) { const d = await r.json(); setRows(d.scholars); setCounts(d.counts) }
  }, [authHeaders])
  useEffect(() => { load() }, [load])
  return { rows, counts, load }
}

function AdminStudentList({ token, authHeaders }: { token: string; authHeaders: Record<string, string> }) {
  const { rows } = useScholars(authHeaders)
  const [trackTab, setTrackTab] = useState<'ALL' | 'ARAL' | 'TINDIG'>('ALL')
  if (!rows) return <div className={s.sec}><p className={s.muted}>Loading…</p></div>
  const shown = trackTab === 'ALL' ? rows : rows.filter((r) => (r.track || 'ARAL') === trackTab)
  const count = (t: 'ARAL' | 'TINDIG') => rows.filter((r) => (r.track || 'ARAL') === t).length
  return (
    <div className={s.sec}>
      <div className={s.subTabs}>
        <button className={`${s.subTab} ${trackTab === 'ALL' ? s.subTabActive : ''}`} onClick={() => setTrackTab('ALL')}>All ({rows.length})</button>
        <button className={`${s.subTab} ${trackTab === 'ARAL' ? s.subTabActive : ''}`} onClick={() => setTrackTab('ARAL')}>Aral Track ({count('ARAL')})</button>
        <button className={`${s.subTab} ${trackTab === 'TINDIG' ? s.subTabActive : ''}`} onClick={() => setTrackTab('TINDIG')}>Tindig Track ({count('TINDIG')})</button>
      </div>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead><tr><th>Photo</th><th>Name (Last, First Middle)</th><th>Track</th><th>Age</th><th>Program</th><th>School</th><th>Permanent City</th><th>Status</th></tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={8} className={s.muted} style={{ padding: 20 }}>No students{trackTab !== 'ALL' ? ' in this track' : ''} yet.</td></tr>}
            {shown.map((r) => (
              <tr key={r.id} className={r.disabledAt ? s.rowDisabled : ''}>
                <td><div className={s.avatarSm}>{r.photoId ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={`${API}/uploads/${r.photoId}?t=${token}`} alt="" /> : <User size={16} />}</div></td>
                <td className={s.cellName}>{[r.lastName, [r.firstName, r.middleName].filter(Boolean).join(' ')].filter(Boolean).join(', ')}<div className={s.cellSub}>@{r.username}</div></td>
                <td><span className={s.tagType}>{TRACK_LABEL[r.track || 'ARAL']}</span></td>
                <td>{r.age ?? '—'}</td><td>{r.program}</td><td>{r.school}</td><td>{r.permCity || '—'}</td>
                <td><span className={`${s.statusPill} ${STATUS_CLASS[r.status] || ''}`}>{STATUS_LABEL[r.status] || r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ══ Application — shared bits ═════════════════════════════════════
function FlowStrip({ part }: { part: 1 | 2 | 3 }) {
  const parts = [{ n: 1, t: 'Part I — Initial', sub: 'Steps 1–4' }, { n: 2, t: 'Part II — Interview', sub: '' }, { n: 3, t: 'Part III — Acceptance', sub: '' }]
  return (
    <div className={s.flow}>
      {parts.map((p, i) => (
        <div key={p.n} className={s.flowItem}>
          <div className={`${s.flowNode} ${part === p.n ? s.flowActive : part > p.n ? s.flowDone : ''}`}>{part > p.n ? <CheckCircle2 size={16} /> : p.n}</div>
          <div className={s.flowText}><b>{p.t}</b>{p.sub && <span>{p.sub}</span>}</div>
          {i < parts.length - 1 && <div className={`${s.flowLine} ${part > p.n ? s.flowLineDone : ''}`} />}
        </div>
      ))}
    </div>
  )
}

const INTEGRITY_NOTE = 'The Fellowship Team holds integrity in the highest regard. All responses submitted here are screened for AI-generated text — please write in your own words. AI-generated responses are strongly discouraged and may disqualify your application.'

type Track = 'ARAL' | 'TINDIG'
const TRACK_LABEL: Record<string, string> = { ARAL: 'Aral Track', TINDIG: 'Tindig Track' }

// Aral Track award tiers: monthly stipend × duration in months. An admin picks
// one at acceptance; it is woven into the Return Service Agreement the fellow
// reads and signs. Order matches the four options the program offers.
const AWARD_TIERS: { monthly: number; months: number }[] = [
  { monthly: 5000, months: 10 },
  { monthly: 10000, months: 10 },
  { monthly: 5000, months: 5 },
  { monthly: 10000, months: 5 },
]
const tierValue = (m?: number | null, n?: number | null) => (m && n ? `${m}x${n}` : '')
const tierLabel = (m: number, n: number) => `₱${m.toLocaleString()}/mo × ${n} months (₱${(m * n).toLocaleString()} total)`
// Peso/month amounts spelled out for the formal RSA text (only the handful the
// tiers can produce).
const AMOUNT_WORDS: Record<number, string> = {
  5: 'five', 10: 'ten',
  5000: 'Five Thousand', 10000: 'Ten Thousand',
  25000: 'Twenty-Five Thousand', 50000: 'Fifty Thousand', 100000: 'One Hundred Thousand',
}
const inWords = (n: number) => AMOUNT_WORDS[n] || n.toLocaleString()

const ARAL_QUESTIONS: { field: keyof AppData; label: string }[] = [
  { field: 'q1WhyApply', label: 'Why do you want to apply for this fellowship?' },
  { field: 'q2Initiatives', label: 'What initiatives have you done in the past that align with our values of Galing, Aral, and Tindig?' },
  { field: 'q3WhyProgram', label: 'What made you want to choose the program that you are currently enrolled in?' },
  { field: 'q4StipendUse', label: 'What will you use the fellowship stipend for?' },
  { field: 'q5ReturnService', label: 'The fellowship requires a return-service agreement with the clinics under the organization. How long will you be willing to work with the clinic/s?' },
  { field: 'q6ArawNgKalinga', label: 'The fellowship also requires awarded fellows to actively participate in the organization’s “Araw ng Kalinga” — a day of giving back through free screening and treatment. Will you be open to actively participating in this initiative?' },
  { field: 'q7FiveYearPlan', label: 'What are your plans in the next five years after getting your license?' },
]
const TINDIG_QUESTIONS: { field: keyof AppData; label: string }[] = [
  { field: 'q1WhyApply', label: 'Why do you want to apply for the UGAT Fellowship — Tindig (licensure-review) Track?' },
  { field: 'q2Initiatives', label: 'What initiatives or experiences during your studies or internship reflect our values of Galing, Aral, and Tindig?' },
  { field: 'q3WhyProgram', label: 'How do you plan to prepare for the Licensure Examination — your review program or self-review plan and timeline?' },
  { field: 'q4StipendUse', label: 'How do you intend to use the review-support grant (e.g., licensure review fees, or a monthly review stipend)?' },
  { field: 'q5ReturnService', label: 'The fellowship requires 1,500 hours of return service at the clinics after you are licensed. How long will you be willing to work with the clinic/s?' },
  { field: 'q6ArawNgKalinga', label: 'The fellowship also requires awarded fellows to actively participate in the organization’s “Araw ng Kalinga” — a day of giving back through free screening and treatment. Will you be open to actively participating in this initiative?' },
  { field: 'q7FiveYearPlan', label: 'What are your plans in the next five years after getting your license?' },
]
const questionsFor = (track?: string) => (track === 'TINDIG' ? TINDIG_QUESTIONS : ARAL_QUESTIONS)

function TrackChooser({ onChoose }: { onChoose: (t: Track) => void }) {
  return (
    <div>
      <div className={s.ayBadge}>First, choose which track you are applying to. Each has different eligibility and requirements.</div>
      <div className={s.trackGrid}>
        <button className={s.trackCard} onClick={() => onChoose('ARAL')}>
          <div className={s.trackName}>Aral Track</div>
          <div className={s.trackTag}>Internship allowance</div>
          <p>For <b>final-year Allied Health interns</b> currently undergoing their clinical internship. Provides a monthly allowance (<b>₱5,000 or ₱10,000</b>) for up to ten months during your internship.</p>
          <span className={s.trackPick}>Apply to Aral Track →</span>
        </button>
        <button className={s.trackCard} onClick={() => onChoose('TINDIG')}>
          <div className={s.trackName}>Tindig Track</div>
          <div className={s.trackTag}>Licensure review support</div>
          <p>For <b>graduates preparing for the Licensure Examination</b> who have finished their internship and were not Aral awardees. Provides a <b>₱30,000</b> review-support grant (review fees, or ₱5,000/month for six months).</p>
          <span className={s.trackPick}>Apply to Tindig Track →</span>
        </button>
      </div>
    </div>
  )
}

// ── Signature pad (canvas) ─────────────────────────────────────────
interface SignaturePadHandle { toDataUrl: () => string | null }
const SignaturePad = forwardRef<SignaturePadHandle>(function SignaturePad(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const dirty = useRef(false)

  useEffect(() => {
    const c = canvasRef.current; if (!c) return
    const ctx = c.getContext('2d'); if (!ctx) return
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#1f2d31'
  }, [])

  function pos(e: React.PointerEvent) {
    const c = canvasRef.current!; const r = c.getBoundingClientRect()
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) }
  }
  function down(e: React.PointerEvent) { drawing.current = true; const ctx = canvasRef.current!.getContext('2d')!; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y) }
  function move(e: React.PointerEvent) { if (!drawing.current) return; const ctx = canvasRef.current!.getContext('2d')!; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); dirty.current = true }
  function up() { drawing.current = false }
  function clear() { const c = canvasRef.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); dirty.current = false }

  useImperativeHandle(ref, () => ({ toDataUrl: () => (dirty.current ? canvasRef.current!.toDataURL('image/png') : null) }), [])

  return (
    <div>
      <canvas ref={canvasRef} width={600} height={180} className={s.sigPad}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} />
      <button type="button" className={s.miniBtn} style={{ marginTop: 6 }} onClick={clear}>Clear signature</button>
    </div>
  )
})

function FileField({ label, kind, accept, uploads, token, onFile }: { label: string; kind: string; accept: string; uploads: Record<string, string>; token: string; onFile: (kind: string, f: File) => Promise<void> }) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const has = uploads[kind]
  return (
    <div className={s.fileRow}>
      <div className={s.fileLabel}>{label}{has && <CheckCircle2 size={15} className={s.okIcon} />}</div>
      <div className={s.fileActions}>
        {has && <a className={s.miniBtn} href={`${API}/uploads/${has}?t=${token}`} target="_blank" rel="noreferrer">View</a>}
        <input ref={ref} type="file" accept={accept} hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setBusy(true); await onFile(kind, f); setBusy(false) } }} />
        <button className={s.miniBtn} disabled={busy} onClick={() => ref.current?.click()}>{busy ? '…' : has ? 'Replace' : 'Upload'}</button>
      </div>
    </div>
  )
}

// ══ Application (scholar) ═════════════════════════════════════════
function ScholarApplication({ session, token, authHeaders }: { session: PortalSession; token: string; authHeaders: Record<string, string> }) {
  const app0 = session.application || null
  // Track is fixed by the scholar's registration.
  const track: Track = session.scholar?.track === 'TINDIG' ? 'TINDIG' : 'ARAL'
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {}
    for (const q of ARAL_QUESTIONS) o[q.field] = (app0?.[q.field] as string) || ''
    return o
  })
  const [truth, setTruth] = useState<boolean>(!!app0?.truthAffirmed)
  const [uploads, setUploads] = useState<Record<string, string>>(session.uploadKinds || {})
  const [submitted, setSubmitted] = useState<boolean>(!!app0?.submittedAt)
  const [tab, setTab] = useState<'initial' | 'interview' | 'acceptance'>('initial')
  const [busy, setBusy] = useState<'' | 'draft' | 'submit'>('')
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [win, setWin] = useState<{ open: boolean; academicYear?: string; closesAt?: string; nextAcademicYear?: string; nextOpensAt?: string } | null>(null)
  const sigRef = useRef<SignaturePadHandle>(null)

  useEffect(() => { fetch(`${API}/window`).then((r) => r.json()).then(setWin).catch(() => setWin({ open: false })) }, [])

  const showInterview = app0?.initialDecision === 'FOR_INTERVIEW'
  const showAcceptance = session.scholar?.status === 'ACCEPTED'

  async function upload(kind: string, f: File) {
    const dataBase64 = await fileToBase64(f)
    const r = await fetch(`${API}/uploads`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ kind, filename: f.name, mimeType: f.type, dataBase64 }) })
    const d = await r.json()
    if (!r.ok) { setMsg({ ok: false, t: d.error || 'Upload failed.' }); return }
    setUploads((u) => ({ ...u, [kind]: d.id })); setMsg({ ok: true, t: 'File uploaded.' })
  }

  async function saveDraft() {
    setBusy('draft'); setMsg(null)
    const r = await fetch(`${API}/application`, { method: 'PUT', headers: authHeaders, body: JSON.stringify({ answers, truthAffirmed: truth, track }) })
    setBusy(''); setMsg(r.ok ? { ok: true, t: 'Draft saved.' } : { ok: false, t: 'Could not save draft.' })
  }

  async function submit() {
    setBusy('submit'); setMsg(null)
    const sig = sigRef.current?.toDataUrl()
    if (sig && !uploads.SIGNATURE) {
      await fetch(`${API}/uploads`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ kind: 'SIGNATURE', filename: 'signature.png', mimeType: 'image/png', dataBase64: sig }) })
        .then((r) => r.json()).then((d) => d.id && setUploads((u) => ({ ...u, SIGNATURE: d.id }))).catch(() => {})
    }
    const r = await fetch(`${API}/application`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ answers, truthAffirmed: truth, track }) })
    const d = await r.json(); setBusy('')
    if (!r.ok) { setMsg({ ok: false, t: d.error || 'Could not submit.' }); return }
    setSubmitted(true)
  }
  const QS = questionsFor(track)

  const tabs: { k: 'initial' | 'interview' | 'acceptance'; label: string; show: boolean }[] = [
    { k: 'initial', label: 'Initial', show: true },
    { k: 'interview', label: 'Interview', show: showInterview },
    { k: 'acceptance', label: 'Acceptance', show: showAcceptance },
  ]

  return (
    <div className={s.sec}>
      <div className={s.integrity}><ShieldCheck size={18} /><span>{INTEGRITY_NOTE}</span></div>
      <FlowStrip part={tab === 'interview' ? 2 : tab === 'acceptance' ? 3 : 1} />

      <div className={s.subTabs}>
        {tabs.filter((t) => t.show).map((t) => <button key={t.k} className={`${s.subTab} ${tab === t.k ? s.subTabActive : ''}`} onClick={() => setTab(t.k)}>{t.label}</button>)}
      </div>

      {tab === 'initial' && (submitted ? (
        <div className={s.card2}>
          <div className={s.acceptedBox}>
            <CheckCircle2 size={26} />
            <div>
              <h3 className={s.card2H} style={{ margin: '0 0 4px' }}>Application received</h3>
              <p className={s.muted} style={{ margin: 0 }}>Thank you! We have accepted your application. Please wait for us to reach out about the next steps — you&rsquo;ll receive a notice on whether you proceed to the interview stage. Decisions are announced by email.</p>
            </div>
          </div>
        </div>
      ) : win === null ? (
        <div className={s.card2}><p className={s.muted} style={{ margin: 0 }}>Loading…</p></div>
      ) : !win.open ? (
        <div className={s.card2}>
          <h3 className={s.card2H}>Applications are currently closed</h3>
          <p className={s.muted} style={{ margin: 0 }}>
            The UGAT Fellowship application isn&rsquo;t open right now.{' '}
            {win.nextAcademicYear && win.nextOpensAt
              ? <>The next cycle (<b>A.Y. {win.nextAcademicYear}</b>) opens on <b>{new Date(win.nextOpensAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</b>.</>
              : <>New cycles are announced here and by email — extensions are usually announced too.</>}{' '}
            Your account is ready, so you can apply as soon as it opens.
          </p>
        </div>
      ) : (
        <>
          {win.academicYear && <div className={s.ayBadge}>You are applying for <b>Academic Year {win.academicYear}</b>.{win.closesAt ? ` Applications close ${new Date(win.closesAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}.` : ''}</div>}
          <div className={s.trackHeader}>You are applying to the <b>{TRACK_LABEL[track]}</b> — the track you registered with.</div>
          {msg && <div className={`${s.alert2} ${msg.ok ? s.alertOk2 : s.alertErr2}`}>{msg.t}</div>}
          <div className={s.appToolbar}>
            <span className={s.muted} style={{ margin: 0 }}>Complete Steps 1–4, then submit. You can save a draft anytime.</span>
            <button className={s.btnGhost3} disabled={!!busy} onClick={saveDraft}>{busy === 'draft' ? 'Saving…' : 'Save Draft'}</button>
          </div>

          <div className={s.card2}>
            <h3 className={s.stepH}><span className={s.stepNum}>1</span> Application form</h3>
            {QS.map((q) => (
              <div key={q.field} className={s.field2}>
                <label className={s.qLabel}>{q.label}</label>
                <textarea className={s.textarea} maxLength={QUESTION_MAX} rows={3} value={answers[q.field]} onChange={(e) => setAnswers((a) => ({ ...a, [q.field]: e.target.value }))} />
                <div className={s.charCount}>{(answers[q.field] || '').length}/{QUESTION_MAX}</div>
              </div>
            ))}
          </div>

          <div className={s.card2}>
            <h3 className={s.stepH}><span className={s.stepNum}>2</span> Motivational letter</h3>
            <p className={s.muted}>Upload a heartfelt, signed motivational letter (maximum {LETTER_MAX_WORDS} words), as a PDF.</p>
            <FileField label="Motivational letter (PDF)" kind="LETTER" accept="application/pdf" uploads={uploads} token={token} onFile={upload} />
          </div>

          {track === 'TINDIG' ? (
            <div className={s.card2}>
              <h3 className={s.stepH}><span className={s.stepNum}>3</span> Academic documents</h3>
              <p className={s.muted}>As a graduate applying to the Tindig Track, upload the following. JPG, PNG, or PDF.</p>
              <FileField label="Transcript of Records" kind="TOR" accept="image/jpeg,image/png,application/pdf" uploads={uploads} token={token} onFile={upload} />
              <FileField label="Proof of graduation / internship completion" kind="GRAD_PROOF" accept="image/jpeg,image/png,application/pdf" uploads={uploads} token={token} onFile={upload} />
            </div>
          ) : (
            <div className={s.card2}>
              <h3 className={s.stepH}><span className={s.stepNum}>3</span> Proof of grades (Years 1–3)</h3>
              <p className={s.muted}>Upload proof of grades for each year level. JPG, PNG, or PDF.</p>
              <FileField label="Year 1" kind="GRADES_Y1" accept="image/jpeg,image/png,application/pdf" uploads={uploads} token={token} onFile={upload} />
              <FileField label="Year 2" kind="GRADES_Y2" accept="image/jpeg,image/png,application/pdf" uploads={uploads} token={token} onFile={upload} />
              <FileField label="Year 3" kind="GRADES_Y3" accept="image/jpeg,image/png,application/pdf" uploads={uploads} token={token} onFile={upload} />
            </div>
          )}

          <div className={s.card2}>
            <h3 className={s.stepH}><span className={s.stepNum}>4</span> Declaration &amp; signature</h3>
            <label className={s.check}>
              <input type="checkbox" checked={truth} onChange={(e) => setTruth(e.target.checked)} />
              <span>I certify that everything I have submitted is true and correct, and that I have written all responses myself.</span>
            </label>
            <p className={s.muted} style={{ marginTop: 14 }}>Sign below (or upload an e-signature image).</p>
            <SignaturePad ref={sigRef} />
            <FileField label="Or upload e-signature (PNG/JPG)" kind="SIGNATURE" accept="image/png,image/jpeg" uploads={uploads} token={token} onFile={upload} />
            <div className={s.muted} style={{ marginTop: 8 }}>Your completion date is stamped automatically when you submit.</div>
          </div>

          <button className={s.btn2Lg} disabled={!!busy} onClick={submit}>{busy === 'submit' ? 'Submitting…' : 'Submit application'}</button>
        </>
      ))}

      {tab === 'interview' && <ScholarInterview app={app0} authHeaders={authHeaders} />}
      {tab === 'acceptance' && session.scholar && <ScholarAcceptance scholar={session.scholar} token={token} authHeaders={authHeaders} />}
    </div>
  )
}

// ══ Interview (scholar) — pick a slot / see confirmed booking ══════
function ScholarInterview({ app, authHeaders }: { app: AppData | null; authHeaders: Record<string, string> }) {
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [booked, setBooked] = useState<{ interviewAt?: string | null; jitsiUrl?: string | null; gcalUrl?: string } | null>(
    app?.interviewAt ? { interviewAt: app.interviewAt, jitsiUrl: app.jitsiUrl } : null,
  )
  const [busy, setBusy] = useState<string>('')
  const [err, setErr] = useState<string | null>(null)
  const [reschedule, setReschedule] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch(`${API}/interview/slots`, { headers: authHeaders })
    if (r.ok) setSlots((await r.json()).slots)
  }, [authHeaders])
  useEffect(() => { load() }, [load])

  async function book(slotId: string) {
    setBusy(slotId); setErr(null)
    const r = await fetch(`${API}/interview/book`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ slotId }) })
    const d = await r.json(); setBusy('')
    if (!r.ok) { setErr(d.error || 'Could not book that slot.'); return }
    setBooked({ interviewAt: d.interviewAt, jitsiUrl: d.jitsiUrl, gcalUrl: d.gcalUrl }); setReschedule(false); load()
  }

  const available = (slots || []).filter((sl) => new Date(sl.startsAt).getTime() > Date.now() && sl.booked < sl.capacity)

  if (booked?.interviewAt && !reschedule) {
    return (
      <div className={s.card2}>
        <div className={s.acceptedBox}>
          <CheckCircle2 size={26} />
          <div style={{ flex: 1 }}>
            <h3 className={s.card2H} style={{ margin: '0 0 4px' }}>Your interview is scheduled</h3>
            <p className={s.muted} style={{ margin: '0 0 12px' }}><b>{fmtWhen(booked.interviewAt)}</b>. We&rsquo;ve emailed you the details too.</p>
            <div className={s.fileActions} style={{ flexWrap: 'wrap' }}>
              {booked.jitsiUrl && <a className={s.btn2} href={booked.jitsiUrl} target="_blank" rel="noreferrer">Join the video interview</a>}
              {booked.gcalUrl && <a className={s.miniBtn} href={booked.gcalUrl} target="_blank" rel="noreferrer">Add to Google Calendar</a>}
              <button className={s.miniBtn} onClick={() => setReschedule(true)}>Reschedule</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={s.card2}>
      <h3 className={s.card2H}>{reschedule ? 'Choose a new interview slot' : 'Schedule your interview'}</h3>
      <p className={s.muted}>Pick a slot below. We&rsquo;ll generate your video-call link and email it to you, along with an add-to-calendar link.</p>
      {err && <div className={`${s.alert2} ${s.alertErr2}`}>{err}</div>}
      {slots === null && <p className={s.muted}>Loading…</p>}
      {slots !== null && available.length === 0 && <p className={s.muted}>No interview slots are available right now. Please check back — we&rsquo;ll email you when slots open.</p>}
      <div className={s.slotGrid}>
        {available.map((sl) => (
          <button key={sl.id} className={s.slotBtn} disabled={!!busy} onClick={() => book(sl.id)}>
            <b>{fmtWhen(sl.startsAt)}</b>
            <span>{sl.durationMins} min{sl.capacity > 1 ? ` · ${sl.capacity - sl.booked} left` : ''}</span>
          </button>
        ))}
      </div>
      {reschedule && <button className={s.btnGhost3} style={{ marginTop: 12 }} onClick={() => setReschedule(false)}>Cancel</button>}
    </div>
  )
}

// ══ Acceptance (scholar) — Return Service Agreement e-signing ══════
type CmField = keyof AcceptanceData
const CM_ADDR = [
  { key: 'Perm', label: 'Permanent address' },
  { key: 'Pres', label: 'Present address' },
  { key: 'Occ', label: 'Address of occupation' },
] as const

function RSAText({ name, program, school, monthly, months }: { name: string; program: string; school: string; monthly?: number | null; months?: number | null }) {
  const m = monthly && months ? monthly : 10000
  const n = monthly && months ? months : 10
  const total = m * n
  const peso = (v: number) => `${inWords(v)} Pesos (PHP ${v.toLocaleString()}.00)`
  return (
    <div className={s.rsaDoc}>
      <h4>Return Service Agreement</h4>
      <p className={s.muted} style={{ margin: '0 0 6px' }}>Sapphire Clinics East Incorporated · UGAT Scholarship Program · Allowance-Based Internship Scholarship</p>
      <div className={s.rsaAward}>
        Your award: <b>₱{m.toLocaleString()} / month for {n} months</b> — an estimated total allowance of <b>₱{total.toLocaleString()}</b>. The full agreement below reflects this award.
      </div>
      <div className={s.rsaScroll}>
        <p><b>KNOW ALL PERSONS BY THESE PRESENTS:</b></p>
        <p>This Return Service Agreement (the &ldquo;Agreement&rdquo;) is made and entered into by and among <b>SAPPHIRE CLINICS EAST INCORPORATED</b>, a corporation duly organized under Philippine law, operating <b>Aura Health Rehab</b>, with principal office at Level 8, GH Tower Offices, Greenhills, San Juan City (&ldquo;SCEI&rdquo; or the &ldquo;Clinic&rdquo;); <b>{name || '________'}</b>, of legal age, Filipino, a {program} student intern of {school} (the &ldquo;SCHOLAR&rdquo;); and the SCHOLAR&rsquo;s parent / guardian (the &ldquo;CO-MAKER&rdquo;). SCEI, the SCHOLAR, and the CO-MAKER are collectively the &ldquo;Parties.&rdquo;</p>
        <p><b>W I T N E S S E T H : T H A T</b></p>
        <p><b>WHEREAS</b>, SCEI has established the UGAT Scholarship Program — <i>Ugnayan para sa Galing, Aral, at Tindig</i> — an allowance-based scholarship for qualified student interns undergoing their clinical internship;</p>
        <p><b>WHEREAS</b>, the SCHOLAR has applied for and has been awarded a scholarship under the UGAT Program, by which SCEI shall provide the SCHOLAR a regular monthly financial allowance throughout the duration of the SCHOLAR&rsquo;s clinical internship;</p>
        <p><b>WHEREAS</b>, in consideration of the allowance extended, the SCHOLAR has agreed to render return service to SCEI following the successful completion of the internship and licensure;</p>
        <p><b>NOW, THEREFORE</b>, for and in consideration of the foregoing premises and the mutual covenants set forth below, the Parties hereby agree as follows:</p>

        <h5>1. DEFINITIONS</h5>
        <p><b>Allowance.</b> The monthly financial stipend of {peso(m)} for {inWords(n)} ({n}) months paid by SCEI to the SCHOLAR for the duration of the internship under the UGAT Program. Where the SCHOLAR is admitted mid-internship, the Allowance is paid only for the remaining months of the internship, up to a maximum of {inWords(n)} ({n}) months.</p>
        <p><b>Internship Period.</b> The SCHOLAR&rsquo;s clinical internship for the applicable School Year.</p>
        <p><b>Total Allowance.</b> The cumulative Allowance actually disbursed over the Internship Period, estimated at {peso(total)}.</p>
        <p><b>Return Service Obligation.</b> The obligation of the SCHOLAR to render One Thousand Five Hundred (1,500) hours of direct patient treatment sessions at any SCEI clinic following licensure, as set out in Section 4.</p>
        <p><b>Licensure.</b> The SCHOLAR&rsquo;s passing of the applicable Professional Licensure Examination and receipt of the corresponding Certificate of Registration and Professional Identification Card from the Professional Regulation Commission (PRC).</p>

        <h5>2. GRANT OF SCHOLARSHIP AND ALLOWANCE</h5>
        <p><b>2.1 Grant.</b> SCEI grants to the SCHOLAR a scholarship under the UGAT Program, consisting of a monthly Allowance of {peso(m)} payable for the duration of the Internship Period for {inWords(n)} ({n}) months. Where only part of the internship year remains, the Allowance is paid only for the remaining months; the Return Service Obligation nonetheless remains the full One Thousand Five Hundred (1,500) hours.</p>
        <p><b>2.2 Disbursement.</b> The Allowance shall be remitted to the SCHOLAR&rsquo;s nominated bank account on or before the tenth (10th) day of each month during the Internship Period.</p>
        <p><b>2.3 Acknowledgment of Indebtedness.</b> The SCHOLAR and CO-MAKER acknowledge that the Allowance, together with the clinical training and supervision extended by SCEI, constitutes sufficient and valuable consideration for the Return Service Obligation, which is fixed at One Thousand Five Hundred (1,500) hours regardless of the actual amount of Allowance disbursed.</p>
        <p><b>2.4 Cut-Short of Internship.</b> Should the SCHOLAR be unable to continue or complete the internship for any reason, the Allowance ceases as of the date of discontinuance, and the SCHOLAR and CO-MAKER agree to reimburse the Allowance actually received up to that date, plus an eight percent (8%) surcharge, within ninety (90) days. SCEI may, in its discretion, waive, reduce, or restructure the reimbursement — particularly where the discontinuance arises from serious illness, a death in the immediate family, or other circumstances beyond the SCHOLAR&rsquo;s control.</p>
        <p><b>2.5 Extension or Delayed Graduation.</b> The Allowance is fixed at {inWords(n)} ({n}) months and shall not be extended under any circumstance. Should the internship be extended or graduation delayed, the SCHOLAR completes the internship at his/her own cost beyond the {n === 10 ? 'tenth (10th)' : 'fifth (5th)'} month, and no additional Allowance shall be due. The Return Service Obligation of One Thousand Five Hundred (1,500) hours remains in full force.</p>

        <h5>3. OBLIGATIONS DURING THE INTERNSHIP</h5>
        <p>During the Internship Period, the SCHOLAR shall: maintain good standing as an enrolled intern; faithfully perform all duties, rotations, and clinical responsibilities assigned; comply with the SCEI Code of Conduct and clinic policies; maintain a passing academic and clinical standing throughout the internship year; signify willingness to be assigned to either or both of SCEI&rsquo;s clinics (East and Greenhills) for the Return Service Obligation; disclose any change in enrollment status within seven (7) days; and sit for and complete the Licensure Examination at the next available date after eligibility.</p>

        <h5>4. RETURN SERVICE OBLIGATION</h5>
        <p><b>4.1 Hours Owed.</b> In consideration of the Allowance and clinical training, the SCHOLAR shall render a total of One Thousand Five Hundred (1,500) hours of direct patient treatment sessions as a licensed professional at any SCEI clinic. The obligation is fixed at 1,500 hours for all scholars regardless of the number of months of Allowance actually funded.</p>
        <p><b>4.2 Commencement.</b> The SCHOLAR shall commence return service within sixty (60) days from receipt of the official PRC Certificate of Registration / Professional Identification Card, rendered continuously and in good faith until completed.</p>
        <p><b>4.3 Crediting of Hours.</b> Each hour of direct patient treatment actually rendered post-licensure is credited toward the 1,500-hour obligation, recorded in real time through SCEI&rsquo;s ERP system, which serves as the official record of hours rendered and the remaining balance.</p>
        <p><b>4.4 Compensation.</b> During the return service period, the SCHOLAR receives the standard market compensation for the position of a licensed professional. The obligation is discharged through hours rendered and is <b>not</b> satisfied by salary deduction; the SCHOLAR receives full compensation for hours worked in addition to credit against the obligation.</p>
        <p><b>4.5 Geographic Assignment.</b> The SCHOLAR agrees to be willing to serve at either or both of SCEI&rsquo;s clinics — <b>Aura Health Rehab – East Branch</b> (Robinsons Metro East, Pasig) and <b>Greenhills Branch</b> (GH Tower, San Juan) — or any future SCEI location, based on operational need. Reasonable preference is considered but not guaranteed.</p>

        <h5>5. COMPLETION AND CERTIFICATION</h5>
        <p>Upon rendering the full 1,500 hours, the Return Service Obligation is deemed fully discharged and SCEI shall issue a Certificate of Completion of Return Service; the obligations of the SCHOLAR and CO-MAKER are thereupon extinguished. Continued engagement with the Clinic afterward is entirely optional and by mutual agreement of the Parties under a separate arrangement.</p>

        <h5>6. SETTLEMENT IN LIEU OF SERVICE</h5>
        <p><b>6.1 Cash Buyout.</b> Should the SCHOLAR elect not to render, or be unable to complete, the obligation, it may be discharged through a cash payment equal to the number of unrendered hours multiplied by an Hourly Credit Rate (PHP 150.00 per hour), plus a flat eight percent (8%) surcharge. By illustration, the buyout for the full 1,500 hours equals PHP 225,000.00 plus the 8% surcharge, totaling PHP 243,000.00.</p>
        <p><b>6.2 Election &amp; Pro-Ration.</b> The SCHOLAR elects a buyout by written notice with at least thirty (30) days&rsquo; lead time; service rendered in good faith is credited, and only the unrendered balance is subject to buyout.</p>

        <h5>7. DEFAULT AND ACCELERATION</h5>
        <p>Events of Default include failure to commence return service on time, voluntary abandonment (other than for serious illness, bereavement, or force majeure), failure to take or pass the Licensure Examination within two (2) cycles after eligibility, or material misrepresentation. SCEI shall give written notice and a thirty (30)-day cure period. Upon an uncured default, the cash value of all unrendered hours becomes immediately due, with an 8% surcharge, a 5% penalty, and interest at 8% per annum from acceleration until fully paid.</p>

        <h5>8. CO-MAKER OBLIGATIONS</h5>
        <p>THE CO-MAKER expressly acknowledges and agrees that he/she is <b>JOINTLY AND SEVERALLY LIABLE</b> with the SCHOLAR for all monetary obligations arising under this Agreement, including any cash buyout, surcharge, penalty, accrued interest, and costs of collection, waiving the benefits of demand, presentment, notice of dishonor, and order of enforcement.</p>

        <h5>9. CONFIDENTIALITY AND DATA PRIVACY</h5>
        <p>This Agreement and related records are confidential and protected consistent with R.A. 10173 (Data Privacy Act of 2012). The SCHOLAR and CO-MAKER consent to SCEI&rsquo;s collection, processing, and use of their personal data to administer this Agreement, including disclosure to SCEI&rsquo;s accountants, auditors, and legal counsel as needed.</p>

        <h5>10. GENERAL PROVISIONS</h5>
        <p>This Agreement is governed by the laws of the Republic of the Philippines, with venue exclusively before the proper courts of San Juan City. It constitutes the entire agreement between the Parties, supersedes all prior understandings, and may be amended only in writing signed by all Parties. If any provision is held invalid, the remaining provisions remain in full force. This Agreement binds the Parties and their respective heirs, successors, and permitted assigns.</p>
      </div>
      <p className={s.muted} style={{ margin: '12px 0 0' }}>By signing below you confirm you have read and understood this full agreement. A hard copy will also be signed in person at an Aura Health Rehab branch.</p>
    </div>
  )
}

function ScholarAcceptance({ scholar, token, authHeaders }: { scholar: PortalScholar; token: string; authHeaders: Record<string, string> }) {
  const [loading, setLoading] = useState(true)
  const [contractSent, setContractSent] = useState(false)
  const [signed, setSigned] = useState<string | null>(null)
  const [hardSigned, setHardSigned] = useState<string | null>(null)
  const [deadlines, setDeadlines] = useState<{ softCopy?: string | null; hardCopy?: string | null }>({})
  const [c, setC] = useState<AcceptanceData>({})
  const [uploads, setUploads] = useState<Record<string, string>>({})
  const [truth, setTruth] = useState(false)
  const [busy, setBusy] = useState<'' | 'draft' | 'submit'>('')
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const sigRef = useRef<SignaturePadHandle>(null)

  const load = useCallback(async () => {
    const r = await fetch(`${API}/acceptance`, { headers: authHeaders })
    if (r.ok) {
      const d = await r.json()
      setContractSent(!!d.acceptance?.contractSentAt)
      setSigned(d.acceptance?.softCopySignedAt || null)
      setHardSigned(d.acceptance?.hardCopySignedAt || null)
      setDeadlines(d.deadlines || {})
      if (d.acceptance) setC(d.acceptance); if (d.acceptance?.truthAffirmed) setTruth(true)
      setUploads(d.uploadKinds || {})
    }
    setLoading(false)
  }, [authHeaders])
  useEffect(() => { load() }, [load])

  const set = (k: CmField, v: string | boolean) => setC((p) => ({ ...p, [k]: v }))
  async function upload(kind: string, f: File) {
    const dataBase64 = await fileToBase64(f)
    const r = await fetch(`${API}/uploads`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ kind, filename: f.name, mimeType: f.type, dataBase64 }) })
    const d = await r.json(); if (!r.ok) { setMsg({ ok: false, t: d.error || 'Upload failed.' }); return }
    setUploads((u) => ({ ...u, [kind]: d.id })); setMsg({ ok: true, t: 'File uploaded.' })
  }
  function payload() {
    const bd = c.comakerBirthdate ? String(c.comakerBirthdate).slice(0, 10) : undefined
    return { comaker: c, comakerBirthdate: bd, cmPresSameAsPerm: !!c.cmPresSameAsPerm, truthAffirmed: truth }
  }
  async function saveDraft() {
    setBusy('draft'); setMsg(null)
    const r = await fetch(`${API}/acceptance`, { method: 'PUT', headers: authHeaders, body: JSON.stringify(payload()) })
    setBusy(''); setMsg(r.ok ? { ok: true, t: 'Draft saved.' } : { ok: false, t: 'Could not save.' })
  }
  async function submit() {
    setBusy('submit'); setMsg(null)
    const sig = sigRef.current?.toDataUrl()
    if (sig && !uploads.RSA_SIGNATURE) {
      await fetch(`${API}/uploads`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ kind: 'RSA_SIGNATURE', filename: 'rsa-signature.png', mimeType: 'image/png', dataBase64: sig }) })
        .then((r) => r.json()).then((d) => d.id && setUploads((u) => ({ ...u, RSA_SIGNATURE: d.id }))).catch(() => {})
    }
    const r = await fetch(`${API}/acceptance`, { method: 'POST', headers: authHeaders, body: JSON.stringify(payload()) })
    const d = await r.json(); setBusy('')
    if (!r.ok) { setMsg({ ok: false, t: d.error || 'Could not submit.' }); return }
    setSigned(new Date().toISOString())
  }

  if (loading) return <div className={s.card2}><p className={s.muted} style={{ margin: 0 }}>Loading…</p></div>
  const fullName = [scholar.firstName, scholar.middleName, scholar.lastName].filter(Boolean).join(' ')

  if (!contractSent) return (
    <div className={s.card2}><div className={s.acceptedBox}><CheckCircle2 size={26} /><div>
      <h3 className={s.card2H} style={{ margin: '0 0 4px' }}>Congratulations — you&rsquo;ve been accepted! 🌱</h3>
      <p className={s.muted} style={{ margin: 0 }}>Welcome to the UGAT Fellowship. We&rsquo;re preparing your Return Service Agreement — it will appear here for you to review and sign shortly, and we&rsquo;ll email you when it&rsquo;s ready.</p>
    </div></div></div>
  )

  if (signed) return (
    <div className={s.card2}><div className={s.acceptedBox}><CheckCircle2 size={26} /><div>
      <h3 className={s.card2H} style={{ margin: '0 0 4px' }}>Thank you — your signed agreement is received</h3>
      <p className={s.muted} style={{ margin: '0 0 8px' }}>To finalize, please sign the <b>hard copy in person</b> at <b>Aura Health Rehab – East</b> (Robinsons Metro East, Pasig) or <b>Greenhills</b> (GH Tower, San Juan){deadlines.hardCopy ? <> by <b>{fmtWhen(deadlines.hardCopy)}</b></> : ''}.</p>
      {hardSigned ? <p className={s.muted} style={{ margin: 0, color: '#2c6b5b' }}><b>Hard copy signed ✓</b> — you&rsquo;re all set. Welcome aboard!</p> : <p className={s.muted} style={{ margin: 0 }}>Your co-maker should come with you, bringing the valid IDs uploaded here.</p>}
    </div></div></div>
  )

  return (
    <div className={s.sec} style={{ padding: 0 }}>
      <RSAText name={fullName} program={scholar.program} school={scholar.school} monthly={scholar.awardMonthly} months={scholar.awardMonths} />
      {msg && <div className={`${s.alert2} ${msg.ok ? s.alertOk2 : s.alertErr2}`}>{msg.t}</div>}
      {deadlines.softCopy && <div className={s.ayBadge}>Please sign online by <b>{fmtWhen(deadlines.softCopy)}</b>.</div>}

      <div className={s.card2}>
        <h3 className={s.card2H}>Co-Maker details</h3>
        <p className={s.muted}>Your co-maker is a parent or guardian who co-signs the agreement with you.</p>
        <div className={s.grid2}>
          <div className={s.field2}><label className={s.qLabel}>First name</label><input className={s.input2} value={c.comakerFirstName || ''} onChange={(e) => set('comakerFirstName', e.target.value)} /></div>
          <div className={s.field2}><label className={s.qLabel}>Middle name</label><input className={s.input2} value={c.comakerMiddleName || ''} onChange={(e) => set('comakerMiddleName', e.target.value)} /></div>
        </div>
        <div className={s.grid2}>
          <div className={s.field2}><label className={s.qLabel}>Last name</label><input className={s.input2} value={c.comakerLastName || ''} onChange={(e) => set('comakerLastName', e.target.value)} /></div>
          <div className={s.field2}><label className={s.qLabel}>Birthdate</label><input type="date" className={s.input2} value={c.comakerBirthdate ? String(c.comakerBirthdate).slice(0, 10) : ''} onChange={(e) => set('comakerBirthdate', e.target.value)} /></div>
        </div>
        <div className={s.grid2}>
          <div className={s.field2}><label className={s.qLabel}>Personal email</label><input type="email" className={s.input2} value={c.comakerEmail || ''} onChange={(e) => set('comakerEmail', e.target.value)} /></div>
          <div className={s.field2}><label className={s.qLabel}>Occupation</label><input className={s.input2} value={c.comakerOccupation || ''} onChange={(e) => set('comakerOccupation', e.target.value)} /></div>
        </div>
        {CM_ADDR.map((blk) => {
          const pre = `cm${blk.key}` as const
          const same = blk.key === 'Pres' && !!c.cmPresSameAsPerm
          const g = (suffix: string) => (c[`${pre}${suffix}` as CmField] as string) || ''
          const sfield = (suffix: string, v: string) => set(`${pre}${suffix}` as CmField, v)
          return (
            <div key={blk.key} style={{ marginTop: 10 }}>
              <div className={s.sectionLabel2}>{blk.label}</div>
              {blk.key === 'Pres' && <label className={s.check}><input type="checkbox" checked={!!c.cmPresSameAsPerm} onChange={(e) => set('cmPresSameAsPerm', e.target.checked)} /><span>Same as Permanent Address</span></label>}
              {!same && <>
                <div className={s.field2}><input className={s.input2} placeholder="Address Line 1" value={g('Address1')} onChange={(e) => sfield('Address1', e.target.value)} /></div>
                <div className={s.field2}><input className={s.input2} placeholder="Address Line 2 (optional)" value={g('Address2')} onChange={(e) => sfield('Address2', e.target.value)} /></div>
                <div className={s.grid3}>
                  <input className={s.input2} placeholder="Municipality / City" value={g('City')} onChange={(e) => sfield('City', e.target.value)} />
                  <input className={s.input2} placeholder="Region" value={g('Region')} onChange={(e) => sfield('Region', e.target.value)} />
                  <input className={s.input2} placeholder="Zip" value={g('Zip')} onChange={(e) => sfield('Zip', e.target.value)} />
                </div>
              </>}
            </div>
          )
        })}
      </div>

      <div className={s.card2}>
        <h3 className={s.card2H}>Valid IDs</h3>
        <p className={s.muted}>Upload two valid IDs each for you and your co-maker (JPG, PNG, or PDF).</p>
        <FileField label="Your Valid ID #1" kind="VALID_ID_1" accept="image/jpeg,image/png,application/pdf" uploads={uploads} token={token} onFile={upload} />
        <FileField label="Your Valid ID #2" kind="VALID_ID_2" accept="image/jpeg,image/png,application/pdf" uploads={uploads} token={token} onFile={upload} />
        <FileField label="Co-maker Valid ID #1" kind="COMAKER_ID_1" accept="image/jpeg,image/png,application/pdf" uploads={uploads} token={token} onFile={upload} />
        <FileField label="Co-maker Valid ID #2" kind="COMAKER_ID_2" accept="image/jpeg,image/png,application/pdf" uploads={uploads} token={token} onFile={upload} />
      </div>

      <div className={s.card2}>
        <h3 className={s.card2H}>Sign the agreement</h3>
        <label className={s.check}><input type="checkbox" checked={truth} onChange={(e) => setTruth(e.target.checked)} /><span>I have read and understood the Return Service Agreement, my co-maker details are true and correct, and I agree to be bound by its terms.</span></label>
        <p className={s.muted} style={{ marginTop: 14 }}>Sign below (or upload an e-signature image).</p>
        <SignaturePad ref={sigRef} />
        <FileField label="Or upload e-signature (PNG/JPG)" kind="RSA_SIGNATURE" accept="image/png,image/jpeg" uploads={uploads} token={token} onFile={upload} />
      </div>

      <div className={s.appToolbar}>
        <button className={s.btnGhost3} disabled={!!busy} onClick={saveDraft}>{busy === 'draft' ? 'Saving…' : 'Save Draft'}</button>
        <button className={s.btn2Lg} disabled={!!busy} onClick={submit}>{busy === 'submit' ? 'Submitting…' : 'Sign & submit agreement'}</button>
      </div>
    </div>
  )
}

// ══ Application (admin) ════════════════════════════════════════════
const DECISIONS = ['NOT_CONSIDERED', 'PENDING', 'FOR_INTERVIEW']
const DECISION_LABEL: Record<string, string> = { NOT_CONSIDERED: 'Not Considered', PENDING: 'Pending', FOR_INTERVIEW: 'For Interview' }
const IDECISIONS = ['NOT_CONSIDERED', 'PENDING', 'FOR_ACCEPTANCE']
const IDECISION_LABEL: Record<string, string> = { NOT_CONSIDERED: 'Not Considered', PENDING: 'Pending', FOR_ACCEPTANCE: 'For Acceptance' }

interface Cycle { id: string; academicYear: string; opensAt: string; closesAt: string; initialDeadline?: string | null; interviewDeadline?: string | null; softCopyDeadline?: string | null; hardCopyDeadline?: string | null }
interface Slot { id: string; startsAt: string; durationMins: number; capacity: number; booked: number }
const fmtWhen = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

function AdminApplication({ token, authHeaders, readOnly, onGoTo }: { token: string; authHeaders: Record<string, string>; readOnly: boolean; onGoTo: (k: SectionKey) => void }) {
  const { rows, load } = useScholars(authHeaders)
  const [tab, setTab] = useState<'initial' | 'interview' | 'acceptance'>('initial')
  const [openId, setOpenId] = useState<string | null>(null)
  const [cycles, setCycles] = useState<Cycle[] | null>(null)
  const [openAY, setOpenAY] = useState<string | undefined>(undefined)
  const [ayFilter, setAyFilter] = useState('ALL')
  const [trackFilter, setTrackFilter] = useState<'ALL' | 'ARAL' | 'TINDIG'>('ALL')
  const [showCycles, setShowCycles] = useState(false)

  const loadCycles = useCallback(async () => {
    const r = await fetch(`${API}/cycles`, { headers: authHeaders })
    if (r.ok) { const d = await r.json(); setCycles(d.cycles); setOpenAY(d.window?.academicYear) }
  }, [authHeaders])
  useEffect(() => { loadCycles() }, [loadCycles])

  async function setDecision(id: string, initialDecision: string) {
    await fetch(`${API}/scholars`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ id, initialDecision }) })
    load()
  }

  if (!rows) return <div className={s.sec}><p className={s.muted}>Loading…</p></div>
  const submittedAll = rows.filter((r) => r.application?.submittedAt)
  const ays = Array.from(new Set(submittedAll.map((r) => r.application?.academicYear).filter(Boolean))) as string[]
  const hasUnassigned = submittedAll.some((r) => !r.application?.academicYear)
  const inAY = (r: AdminScholar) => ayFilter === 'ALL' || (ayFilter === 'UNASSIGNED' ? !r.application?.academicYear : r.application?.academicYear === ayFilter)
  const inTrack = (r: AdminScholar) => trackFilter === 'ALL' || (r.track || 'ARAL') === trackFilter
  const inScope = (r: AdminScholar) => inAY(r) && inTrack(r)
  const submitted = submittedAll.filter(inScope)
  const forInterview = submitted.filter((r) => r.application?.initialDecision === 'FOR_INTERVIEW')
  const accepted = rows.filter((r) => r.status === 'ACCEPTED').filter(inScope)

  // Deadline reminders (1 day before, or after it lapses with Pending left).
  const openCycle = cycles?.find((c) => c.academicYear === openAY)
  const pendInitial = submittedAll.filter((r) => (r.application?.initialDecision || 'PENDING') === 'PENDING').length
  const pendInterview = submittedAll.filter((r) => r.application?.initialDecision === 'FOR_INTERVIEW' && (r.application?.interviewDecision || 'PENDING') === 'PENDING').length
  const alertFor = (iso: string | null | undefined, count: number, label: string): { kind: 'warn' | 'err'; t: string } | null => {
    if (!iso || count === 0) return null
    const dl = new Date(iso).getTime(); const now = Date.now()
    if (now > dl) return { kind: 'err', t: `The ${label} deadline has passed and ${count} applicant${count > 1 ? 's are' : ' is'} still Pending — please decide now.` }
    if (dl - now <= 86400000) return { kind: 'warn', t: `${count} applicant${count > 1 ? 's are' : ' is'} still Pending and the ${label} decision deadline is ${fmtWhen(iso)}. Please finalize.` }
    return null
  }
  const alerts = [alertFor(openCycle?.initialDeadline, pendInitial, 'Initial'), alertFor(openCycle?.interviewDeadline, pendInterview, 'Interview')].filter(Boolean) as { kind: 'warn' | 'err'; t: string }[]

  return (
    <div className={s.sec}>
      {readOnly && <div className={s.integrity}><Eye size={16} /><span>University-admin view — read only.</span></div>}
      {!readOnly && alerts.map((a, i) => <div key={i} className={`${s.alert2} ${a.kind === 'err' ? s.alertErr2 : s.alertWarn2}`}>⏰ {a.t}</div>)}
      <div className={s.uaHead}>
        <div className={s.ayFilter}>
          <label className={s.cellSub}>Academic Year:</label>
          <select className={s.statusSelect} value={ayFilter} onChange={(e) => setAyFilter(e.target.value)}>
            <option value="ALL">All years</option>
            {ays.map((y) => <option key={y} value={y}>A.Y. {y}{y === openAY ? ' (open)' : ''}</option>)}
            {hasUnassigned && <option value="UNASSIGNED">Unassigned</option>}
          </select>
        </div>
        {!readOnly && <button className={s.btnGhost3} onClick={() => setShowCycles((v) => !v)}><Calendar size={15} /> Application timelines</button>}
      </div>
      {showCycles && !readOnly && <CyclesPanel authHeaders={authHeaders} cycles={cycles} reload={loadCycles} />}
      <div className={s.subTabs}>
        {(['ALL', 'ARAL', 'TINDIG'] as const).map((t) => (
          <button key={t} className={`${s.chip} ${trackFilter === t ? s.chipActive : ''}`} onClick={() => setTrackFilter(t)}>
            {t === 'ALL' ? 'All tracks' : TRACK_LABEL[t]} ({submittedAll.filter((r) => t === 'ALL' || (r.track || 'ARAL') === t).length})
          </button>
        ))}
      </div>
      <div className={s.subTabs}>
        <button className={`${s.subTab} ${tab === 'initial' ? s.subTabActive : ''}`} onClick={() => setTab('initial')}>Initial</button>
        <button className={`${s.subTab} ${tab === 'interview' ? s.subTabActive : ''}`} onClick={() => setTab('interview')}>Interview</button>
        <button className={`${s.subTab} ${tab === 'acceptance' ? s.subTabActive : ''}`} onClick={() => setTab('acceptance')}>Acceptance</button>
      </div>

      {tab === 'initial' && (
        <div className={s.card2}>
          <h3 className={s.card2H}>Applicants — Part I</h3>
          {submitted.length === 0 && <p className={s.muted}>No submitted applications yet.</p>}
          {submitted.map((r) => (
            <div key={r.id} className={s.appRow}>
              <button className={s.appRowHead} onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                <ChevronDown size={16} className={openId === r.id ? s.rot : ''} />
                <span className={s.appRowName}>{[r.lastName, [r.firstName, r.middleName].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</span>
                <span className={s.tagType}>{TRACK_LABEL[r.application?.track || 'ARAL']}</span>
                <span className={`${s.statusPill} ${r.application?.initialDecision === 'FOR_INTERVIEW' ? s.stAccepted : r.application?.initialDecision === 'NOT_CONSIDERED' ? s.stRejected : s.stApplied}`}>{DECISION_LABEL[r.application?.initialDecision || 'PENDING']}</span>
              </button>
              {openId === r.id && <ApplicantDetail r={r} token={token} readOnly={readOnly} onDecide={(d) => setDecision(r.id, d)} />}
            </div>
          ))}
        </div>
      )}

      {tab === 'interview' && <InterviewStage students={forInterview} authHeaders={authHeaders} readOnly={readOnly} reloadScholars={load} />}

      {tab === 'acceptance' && <AcceptanceStage fellows={accepted} token={token} authHeaders={authHeaders} readOnly={readOnly} reloadScholars={load} onGoTo={onGoTo} />}
    </div>
  )
}

// ══ Interview stage (admin) — slots + booked students + decisions ══
function InterviewStage({ students, authHeaders, readOnly, reloadScholars }: { students: AdminScholar[]; authHeaders: Record<string, string>; readOnly: boolean; reloadScholars: () => void }) {
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [form, setForm] = useState({ startsAt: '', durationMins: '30', capacity: '1' })
  const [showSlots, setShowSlots] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notify, setNotify] = useState<{ ok: boolean; t: string } | null>(null)

  const loadSlots = useCallback(async () => {
    const r = await fetch(`${API}/interview/slots`, { headers: authHeaders })
    if (r.ok) setSlots((await r.json()).slots)
  }, [authHeaders])
  useEffect(() => { loadSlots() }, [loadSlots])

  async function addSlot(e: React.FormEvent) {
    e.preventDefault(); if (!form.startsAt) return; setBusy(true)
    await fetch(`${API}/interview/slots`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ startsAt: new Date(form.startsAt).toISOString(), durationMins: Number(form.durationMins), capacity: Number(form.capacity) }) })
    setForm({ startsAt: '', durationMins: '30', capacity: '1' }); setBusy(false); loadSlots()
  }
  async function delSlot(id: string) { if (!window.confirm('Delete this slot? Any booking on it is released.')) return; await fetch(`${API}/interview/slots`, { method: 'DELETE', headers: authHeaders, body: JSON.stringify({ id }) }); loadSlots(); reloadScholars() }
  async function setDecision(id: string, interviewDecision: string) { await fetch(`${API}/scholars`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ id, interviewDecision }) }); reloadScholars() }
  async function notifyRejected() {
    if (!window.confirm('Send the empathic "not considered" email to everyone marked Not Considered who hasn’t been notified yet?')) return
    setNotify(null)
    const r = await fetch(`${API}/interview/notify-rejected`, { method: 'POST', headers: authHeaders })
    const d = await r.json().catch(() => ({}))
    setNotify(r.ok ? { ok: true, t: `Sent ${d.sent} email${d.sent === 1 ? '' : 's'}.` } : { ok: false, t: d.error || 'Could not send.' })
  }

  return (
    <>
      {!readOnly && (
        <div className={s.card2}>
          <div className={s.uaHead}>
            <h3 className={s.card2H} style={{ margin: 0 }}>Interview availability</h3>
            <div className={s.uaHeadBtns}>
              <button className={s.btnGhost3} onClick={() => setShowSlots((v) => !v)}><Calendar size={15} /> {showSlots ? 'Hide slots' : 'Manage slots'}</button>
              <button className={s.btnGhost3} onClick={notifyRejected}><Mail size={15} /> Email not-considered</button>
            </div>
          </div>
          {notify && <div className={`${s.alert2} ${notify.ok ? s.alertOk2 : s.alertErr2}`}>{notify.t}</div>}
          {showSlots && (
            <>
              <form className={s.cycleForm} onSubmit={addSlot}>
                <label className={s.dtField}>Date &amp; time<input type="datetime-local" className={s.input2} value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} required /></label>
                <label className={s.dtField}>Minutes<input type="number" min={10} max={240} className={s.input2} style={{ width: 90 }} value={form.durationMins} onChange={(e) => setForm({ ...form, durationMins: e.target.value })} /></label>
                <label className={s.dtField}>Capacity<input type="number" min={1} max={20} className={s.input2} style={{ width: 80 }} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></label>
                <button className={s.btn2} disabled={busy}><Plus size={16} /> Add slot</button>
              </form>
              <div className={s.accessList}>
                {slots?.map((sl) => (
                  <div key={sl.id} className={s.accessItem}>
                    <div><b>{fmtWhen(sl.startsAt)}</b><span className={s.cellSub}>{sl.durationMins} min · {sl.booked}/{sl.capacity} booked{new Date(sl.startsAt).getTime() < Date.now() ? ' · past' : ''}</span></div>
                    <button className={`${s.miniBtn} ${s.miniDanger}`} onClick={() => delSlot(sl.id)}>Delete</button>
                  </div>
                ))}
                {slots && slots.length === 0 && <p className={s.muted} style={{ margin: '6px 2px' }}>No slots yet. Add availability so students can book.</p>}
              </div>
            </>
          )}
        </div>
      )}

      <div className={s.card2}>
        <h3 className={s.card2H}>For-Interview applicants</h3>
        {students.length === 0 && <p className={s.muted}>No students at the interview stage yet. Mark an applicant &ldquo;For Interview&rdquo; in the Initial tab.</p>}
        {students.map((r) => {
          const a = r.application
          return (
            <div key={r.id} className={s.appRow}>
              <div className={s.intvRow}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={s.appRowName}>{[r.lastName, [r.firstName, r.middleName].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</div>
                  <div className={s.cellSub}>
                    {a?.interviewAt ? <>🗓 {fmtWhen(a.interviewAt)}{a.jitsiUrl ? <> · <a href={a.jitsiUrl} target="_blank" rel="noreferrer" className={s.linkBtn2}>Jitsi link</a></> : ''}</> : 'Not yet booked'}
                  </div>
                </div>
                {readOnly ? (
                  <span className={`${s.statusPill} ${a?.interviewDecision === 'FOR_ACCEPTANCE' ? s.stAccepted : a?.interviewDecision === 'NOT_CONSIDERED' ? s.stRejected : s.stApplied}`}>{IDECISION_LABEL[a?.interviewDecision || 'PENDING']}</span>
                ) : (
                  <select className={s.statusSelect} value={a?.interviewDecision || 'PENDING'} onChange={(e) => setDecision(r.id, e.target.value)}>
                    {IDECISIONS.map((d) => <option key={d} value={d}>{IDECISION_LABEL[d]}</option>)}
                  </select>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

// ══ Acceptance stage (admin) — send contract, review, hard copy ════
function AcceptanceStage({ fellows, token, authHeaders, readOnly, reloadScholars, onGoTo }: { fellows: AdminScholar[]; token: string; authHeaders: Record<string, string>; readOnly: boolean; reloadScholars: () => void; onGoTo: (k: SectionKey) => void }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string>('')

  async function sendContract(id: string) {
    if (!window.confirm('Send the Return Service Agreement to this fellow so they can sign online? They will be emailed a link.')) return
    setBusy(id); await fetch(`${API}/acceptance/admin`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ scholarId: id }) }); setBusy(''); reloadScholars()
  }
  async function setAward(id: string, monthly: number | null, months: number | null) {
    setBusy(id); await fetch(`${API}/scholars`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ id, awardMonthly: monthly, awardMonths: months }) }); setBusy(''); reloadScholars()
  }
  async function toggleHard(id: string, signed: boolean) {
    await fetch(`${API}/acceptance/admin`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ scholarId: id, hardCopySigned: signed }) }); reloadScholars()
  }

  return (
    <div className={s.card2}>
      <h3 className={s.card2H}>Accepted fellows</h3>
      {fellows.length === 0 && <p className={s.muted}>No accepted fellows yet. Mark an interviewed applicant &ldquo;For Acceptance&rdquo; in the Interview tab, or check the <button className={s.linkBtn2} onClick={() => onGoTo('dashboard')}>Dashboard</button>.</p>}
      {fellows.map((r) => {
        const a = r.acceptance
        const stage = !a?.contractSentAt ? 'Not sent' : a?.hardCopySignedAt ? 'Hard copy signed' : a?.softCopySignedAt ? 'Soft copy signed' : 'Awaiting signature'
        const cls = stage === 'Hard copy signed' ? s.stAccepted : stage === 'Not sent' ? s.stApplied : s.stWait
        const isAral = (r.track || 'ARAL') === 'ARAL'
        const hasAward = !!(r.awardMonthly && r.awardMonths)
        return (
          <div key={r.id} className={s.appRow}>
            <div className={s.intvRow}>
              <button className={s.appRowHead} style={{ flex: 1, padding: '4px 0' }} onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                <ChevronDown size={16} className={openId === r.id ? s.rot : ''} />
                <span className={s.appRowName}>{[r.lastName, [r.firstName, r.middleName].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</span>
                <span className={`${s.statusPill} ${cls}`}>{stage}</span>
              </button>
              <div className={s.acceptCtl}>
                {isAral && !readOnly && !a?.contractSentAt && (
                  <select className={s.awardSelect} value={tierValue(r.awardMonthly, r.awardMonths)} disabled={busy === r.id}
                    onChange={(e) => { const v = e.target.value; if (!v) { setAward(r.id, null, null); return } const [m, n] = v.split('x').map(Number); setAward(r.id, m, n) }}>
                    <option value="">Award tier…</option>
                    {AWARD_TIERS.map((t) => { const val = tierValue(t.monthly, t.months); return <option key={val} value={val}>{tierLabel(t.monthly, t.months)}</option> })}
                  </select>
                )}
                {isAral && hasAward && a?.contractSentAt && <span className={s.awardTag}>{tierLabel(r.awardMonthly!, r.awardMonths!)}</span>}
                {!readOnly && !a?.contractSentAt && <button className={s.btn2} disabled={busy === r.id || (isAral && !hasAward)} title={isAral && !hasAward ? 'Choose an award tier first' : undefined} onClick={() => sendContract(r.id)}><Mail size={15} /> {busy === r.id ? 'Sending…' : 'Send Contract'}</button>}
              </div>
            </div>
            {openId === r.id && (
              <div className={s.appDetail}>
                {isAral && <p className={s.muted} style={{ margin: '0 0 8px' }}>Award tier: {hasAward ? <b>{tierLabel(r.awardMonthly!, r.awardMonths!)}</b> : <span style={{ color: '#b4690e' }}>not set — choose a tier before sending the contract</span>}{hasAward && a?.contractSentAt ? ' (locked — reflected in the signed agreement)' : ''}</p>}
                {!a?.contractSentAt && <p className={s.muted}>Send the contract to unlock the fellow&rsquo;s signing form.</p>}
                {a?.contractSentAt && (
                  <>
                    <div className={s.qaList}>
                      <div className={s.qa}><div className={s.qaQ}>Co-maker</div><div className={s.qaA}>{[a.comakerFirstName, a.comakerMiddleName, a.comakerLastName].filter(Boolean).join(' ') || '—'}{a.comakerOccupation ? ` · ${a.comakerOccupation}` : ''}{a.comakerEmail ? ` · ${a.comakerEmail}` : ''}</div></div>
                      <div className={s.qa}><div className={s.qaQ}>Co-maker permanent address</div><div className={s.qaA}>{[a.cmPermAddress1, a.cmPermAddress2, a.cmPermCity, a.cmPermRegion, a.cmPermZip].filter(Boolean).join(', ') || '—'}</div></div>
                      <div className={s.qa}><div className={s.qaQ}>Co-maker occupation address</div><div className={s.qaA}>{[a.cmOccAddress1, a.cmOccAddress2, a.cmOccCity, a.cmOccRegion, a.cmOccZip].filter(Boolean).join(', ') || '—'}</div></div>
                    </div>
                    <div className={s.docLinks} style={{ marginTop: 10 }}>
                      {(['VALID_ID_1', 'VALID_ID_2', 'COMAKER_ID_1', 'COMAKER_ID_2'] as const).map((k) => r.uploadKinds[k]
                        ? <a key={k} className={s.miniBtn} href={`${API}/uploads/${r.uploadKinds[k]}?t=${token}`} target="_blank" rel="noreferrer">{k.replace('VALID_ID_', 'ID ').replace('COMAKER_ID_', 'Co-maker ID ')}</a>
                        : <span key={k} className={s.muted}>{k.replace('VALID_ID_', 'ID ').replace('COMAKER_ID_', 'Co-maker ID ')}: —</span>)}
                      {r.uploadKinds.RSA_SIGNATURE ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={`${API}/uploads/${r.uploadKinds.RSA_SIGNATURE}?t=${token}`} alt="signature" className={s.sigView} /> : null}
                    </div>
                    <p className={s.muted} style={{ marginTop: 8 }}>Soft copy: {a.softCopySignedAt ? `signed ${fmtWhen(a.softCopySignedAt)}` : 'not yet signed'} · Hard copy: {a.hardCopySignedAt ? `signed ${fmtWhen(a.hardCopySignedAt)}` : 'not yet signed'}</p>
                    {!readOnly && a.softCopySignedAt && (
                      <label className={s.check}><input type="checkbox" checked={!!a.hardCopySignedAt} onChange={(e) => toggleHard(r.id, e.target.checked)} /><span>Hard copy signed in person</span></label>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Local <input type="datetime-local"> value <-> ISO helpers.
function toLocalInput(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

const emptyCycleForm = { id: '', academicYear: '', opensAt: '', closesAt: '', initialDeadline: '', interviewDeadline: '', softCopyDeadline: '', hardCopyDeadline: '' }

function CyclesPanel({ authHeaders, cycles, reload }: { authHeaders: Record<string, string>; cycles: Cycle[] | null; reload: () => void }) {
  const [form, setForm] = useState({ ...emptyCycleForm })
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [announcing, setAnnouncing] = useState(false)
  const editing = !!form.id

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null)
    const iso = (v: string) => (v ? new Date(v).toISOString() : null)
    const payload = {
      ...(editing ? { id: form.id } : {}),
      academicYear: form.academicYear.trim(),
      opensAt: form.opensAt ? new Date(form.opensAt).toISOString() : '',
      closesAt: form.closesAt ? new Date(form.closesAt).toISOString() : '',
      initialDeadline: iso(form.initialDeadline),
      interviewDeadline: iso(form.interviewDeadline),
      softCopyDeadline: iso(form.softCopyDeadline),
      hardCopyDeadline: iso(form.hardCopyDeadline),
    }
    const r = await fetch(`${API}/cycles`, { method: editing ? 'PATCH' : 'POST', headers: authHeaders, body: JSON.stringify(payload) })
    const d = await r.json().catch(() => ({})); setBusy(false)
    if (!r.ok) { setMsg({ ok: false, t: d.error || 'Could not save.' }); return }
    setMsg({ ok: true, t: editing ? 'Cycle updated.' : 'Cycle added.' })
    setForm({ ...emptyCycleForm }); reload()
  }
  function edit(c: Cycle) { setForm({ id: c.id, academicYear: c.academicYear, opensAt: toLocalInput(c.opensAt), closesAt: toLocalInput(c.closesAt), initialDeadline: toLocalInput(c.initialDeadline || undefined), interviewDeadline: toLocalInput(c.interviewDeadline || undefined), softCopyDeadline: toLocalInput(c.softCopyDeadline || undefined), hardCopyDeadline: toLocalInput(c.hardCopyDeadline || undefined) }); setMsg(null) }
  async function remove(c: Cycle) {
    if (!window.confirm(`Delete the A.Y. ${c.academicYear} cycle? Submitted applications keep their year tag.`)) return
    await fetch(`${API}/cycles`, { method: 'DELETE', headers: authHeaders, body: JSON.stringify({ id: c.id }) }); reload()
  }
  const now = Date.now()
  const status = (c: Cycle) => { const o = +new Date(c.opensAt), cl = +new Date(c.closesAt); return now < o ? 'Upcoming' : now > cl ? 'Closed' : 'Open' }
  const hasOpen = !!cycles?.some((c) => status(c) === 'Open')

  async function announce() {
    if (!window.confirm('Email every account holder that applications are now open? This sends to all non-disabled accounts.')) return
    setAnnouncing(true); setMsg(null)
    const r = await fetch(`${API}/cycles/announce`, { method: 'POST', headers: authHeaders })
    const d = await r.json().catch(() => ({})); setAnnouncing(false)
    if (!r.ok) { setMsg({ ok: false, t: d.error || 'Could not send the announcement.' }); return }
    setMsg({ ok: true, t: `Announcement emailed to ${d.accounts} account holder${d.accounts === 1 ? '' : 's'} for A.Y. ${d.academicYear}.` })
  }

  return (
    <div className={s.card2}>
      <div className={s.uaHead}>
        <h3 className={s.card2H} style={{ margin: 0 }}>Application timelines</h3>
        <button className={s.btn2} disabled={announcing || !hasOpen} title={hasOpen ? 'Notify account holders that applications are open' : 'Open a cycle first'} onClick={announce}>
          <Mail size={15} /> {announcing ? 'Sending…' : 'Email account holders'}
        </button>
      </div>
      <p className={s.muted}>Set each academic year&rsquo;s open and close dates. While a cycle is open, submissions are automatically tagged to that year. Outside every window, students see a &ldquo;closed&rdquo; notice instead of the form. When a cycle is open, use <b>Email account holders</b> to notify everyone with an account that they can apply.</p>
      <form className={s.cycleForm} onSubmit={submit}>
        <input className={s.input2} placeholder="Academic year (e.g. 2026-2027)" value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })} required />
        <label className={s.dtField}>Opens<input type="datetime-local" className={s.input2} value={form.opensAt} onChange={(e) => setForm({ ...form, opensAt: e.target.value })} required /></label>
        <label className={s.dtField}>Closes<input type="datetime-local" className={s.input2} value={form.closesAt} onChange={(e) => setForm({ ...form, closesAt: e.target.value })} required /></label>
        <label className={s.dtField}>Initial-decision deadline<input type="datetime-local" className={s.input2} value={form.initialDeadline} onChange={(e) => setForm({ ...form, initialDeadline: e.target.value })} /></label>
        <label className={s.dtField}>Interview-decision deadline<input type="datetime-local" className={s.input2} value={form.interviewDeadline} onChange={(e) => setForm({ ...form, interviewDeadline: e.target.value })} /></label>
        <label className={s.dtField}>Soft-copy signing deadline<input type="datetime-local" className={s.input2} value={form.softCopyDeadline} onChange={(e) => setForm({ ...form, softCopyDeadline: e.target.value })} /></label>
        <label className={s.dtField}>Hard-copy signing deadline<input type="datetime-local" className={s.input2} value={form.hardCopyDeadline} onChange={(e) => setForm({ ...form, hardCopyDeadline: e.target.value })} /></label>
        <button className={s.btn2} disabled={busy}>{editing ? 'Save cycle' : <><Plus size={16} /> Add cycle</>}</button>
        {editing && <button type="button" className={s.btnGhost3} onClick={() => setForm({ ...emptyCycleForm })}>Cancel</button>}
      </form>
      {msg && <div className={`${s.alert2} ${msg.ok ? s.alertOk2 : s.alertErr2}`}>{msg.t}</div>}
      <div className={s.accessList}>
        {cycles?.map((c) => {
          const st = status(c)
          return (
            <div key={c.id} className={s.accessItem}>
              <div><b>A.Y. {c.academicYear}</b><span className={s.cellSub}>{fmtDate(c.opensAt)} → {fmtDate(c.closesAt)}{c.initialDeadline ? ` · decide by ${fmtDate(c.initialDeadline)}` : ''}</span></div>
              <div className={s.accessActions}>
                <span className={`${s.statusPill} ${st === 'Open' ? s.stAccepted : st === 'Upcoming' ? s.stApplied : s.stRejected}`}>{st}</span>
                <button className={s.miniBtn} onClick={() => edit(c)}>Edit</button>
                <button className={`${s.miniBtn} ${s.miniDanger}`} onClick={() => remove(c)}>Delete</button>
              </div>
            </div>
          )
        })}
        {cycles && cycles.length === 0 && <p className={s.muted} style={{ margin: '6px 2px' }}>No cycles yet. Add one to open applications.</p>}
      </div>
    </div>
  )
}

function ApplicantDetail({ r, token, readOnly, onDecide }: { r: AdminScholar; token: string; readOnly: boolean; onDecide: (d: string) => void }) {
  const [step, setStep] = useState(1)
  const a = r.application || {}
  const isTindig = a.track === 'TINDIG'
  const doc = (kind: string, label: string) => r.uploadKinds[kind]
    ? <a key={kind} className={s.miniBtn} href={`${API}/uploads/${r.uploadKinds[kind]}?t=${token}`} target="_blank" rel="noreferrer">{label}</a>
    : <span key={kind} className={s.muted}>{label}: — </span>
  return (
    <div className={s.appDetail}>
      <div className={s.docLinks} style={{ marginBottom: 10 }}><span className={`${s.tagType}`}>{TRACK_LABEL[a.track || 'ARAL']}</span></div>
      <div className={s.stepTabs}>{[1, 2, 3, 4].map((n) => <button key={n} className={`${s.stepTab} ${step === n ? s.stepTabActive : ''}`} onClick={() => setStep(n)}>Step {n}</button>)}</div>
      {step === 1 && <div className={s.qaList}>{questionsFor(a.track).map((q) => <div key={q.field} className={s.qa}><div className={s.qaQ}>{q.label}</div><div className={s.qaA}>{(a[q.field] as string) || <span className={s.muted}>—</span>}</div></div>)}</div>}
      {step === 2 && <div className={s.docLinks}>{r.uploadKinds.LETTER ? <a className={s.miniBtn} href={`${API}/uploads/${r.uploadKinds.LETTER}?t=${token}`} target="_blank" rel="noreferrer">View motivational letter</a> : <span className={s.muted}>No letter uploaded.</span>}</div>}
      {step === 3 && <div className={s.docLinks}>{isTindig ? [doc('TOR', 'Transcript of Records'), doc('GRAD_PROOF', 'Proof of graduation / internship')] : ['GRADES_Y1', 'GRADES_Y2', 'GRADES_Y3'].map((k) => doc(k, `Grades — Year ${k.slice(-1)}`))}</div>}
      {step === 4 && <div><div className={s.docLinks}>{r.uploadKinds.SIGNATURE ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={`${API}/uploads/${r.uploadKinds.SIGNATURE}?t=${token}`} alt="signature" className={s.sigView} /> : <span className={s.muted}>No signature.</span>}</div><p className={s.muted} style={{ marginTop: 8 }}>Declaration affirmed: {a.truthAffirmed ? 'Yes' : 'No'}{a.signedAt ? ` · signed ${new Date(a.signedAt).toLocaleDateString()}` : ''}</p></div>}
      {!readOnly && (
        <div className={s.decisionRow}>
          <label className={s.qLabel} style={{ margin: 0 }}>Decision:</label>
          <select className={s.statusSelect} value={a.initialDecision || 'PENDING'} onChange={(e) => onDecide(e.target.value)}>{DECISIONS.map((d) => <option key={d} value={d}>{DECISION_LABEL[d]}</option>)}</select>
        </div>
      )}
    </div>
  )
}

// ══ Dashboard ══════════════════════════════════════════════════════
function Dashboard({ authHeaders }: { authHeaders: Record<string, string> }) {
  const { rows } = useScholars(authHeaders)
  const [filter, setFilter] = useState<'ALL' | 'ACCEPTED' | 'REJECTED'>('ALL')
  const [trackTab, setTrackTab] = useState<'ALL' | 'ARAL' | 'TINDIG'>('ALL')
  if (!rows) return <div className={s.sec}><p className={s.muted}>Loading…</p></div>

  const base = trackTab === 'ALL' ? rows : rows.filter((r) => (r.track || 'ARAL') === trackTab)
  const pop = filter === 'ALL' ? base : base.filter((r) => r.status === filter)
  const ages = pop.map((r) => r.age).filter((a): a is number => a != null)
  const avgAge = ages.length ? Math.round((ages.reduce((x, y) => x + y, 0) / ages.length) * 10) / 10 : null
  const accepted = base.filter((r) => r.status === 'ACCEPTED').length
  const rejected = base.filter((r) => r.status === 'REJECTED').length
  const applicants = base.filter((r) => r.application?.submittedAt).length
  const cities: Record<string, number> = {}
  for (const r of pop) { const c = (r.permCity || '').trim() || 'Unspecified'; cities[c] = (cities[c] || 0) + 1 }
  const cityList = Object.entries(cities).sort((a, b) => b[1] - a[1])

  return (
    <div className={s.sec}>
      <div className={s.subTabs}>
        {(['ALL', 'ARAL', 'TINDIG'] as const).map((t) => (
          <button key={t} className={`${s.chip} ${trackTab === t ? s.chipActive : ''}`} onClick={() => setTrackTab(t)}>
            {t === 'ALL' ? 'All tracks' : TRACK_LABEL[t]} ({(t === 'ALL' ? rows : rows.filter((r) => (r.track || 'ARAL') === t)).length})
          </button>
        ))}
      </div>
      <div className={s.chips}>{(['ALL', 'ACCEPTED', 'REJECTED'] as const).map((k) => <button key={k} className={`${s.chip} ${filter === k ? s.chipActive : ''}`} onClick={() => setFilter(k)}>{k === 'ALL' ? 'All' : k === 'ACCEPTED' ? 'Accepted' : 'Rejected'}</button>)}</div>
      <div className={s.statRow}>
        <Stat label="Applicants" value={applicants} />
        <Stat label="Registered" value={base.length} />
        <Stat label="Average age" value={avgAge ?? '—'} />
        <Stat label="Accepted" value={accepted} accent />
        <Stat label="Rejected" value={rejected} />
        <Stat label="Accepted vs applied" value={applicants ? `${Math.round((accepted / applicants) * 100)}%` : '—'} />
      </div>
      <div className={s.card2}>
        <h3 className={s.card2H}>Cities {filter !== 'ALL' ? `(${filter === 'ACCEPTED' ? 'accepted' : 'rejected'})` : ''}</h3>
        {cityList.length === 0 && <p className={s.muted}>No data.</p>}
        {cityList.map(([city, n]) => <div key={city} className={s.cityRow}><span>{city}</span><div className={s.cityBarWrap}><div className={s.cityBar} style={{ width: `${(n / (cityList[0]?.[1] || 1)) * 100}%` }} /></div><b>{n}</b></div>)}
      </div>
    </div>
  )
}
function Stat({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return <div className={`${s.stat} ${accent ? s.statAccent : ''}`}><div className={s.statValue}>{value}</div><div className={s.statLabel}>{label}</div></div>
}

// ══ Schools Data ═══════════════════════════════════════════════════
function SchoolsData() {
  return <div className={s.secFlush}><iframe className={s.embed} src="/school-data/" title="OT / SLP Schools Data" loading="lazy" /></div>
}

// ══ Settings — dropdown options editor (batched, explicit Save) ════
// Edits are local until "Save changes" flushes creates / updates / deletes to
// the shared UgatOption table (so changes persist for every user).
type Kind = 'SCHOOL' | 'PROGRAM' | 'FIELD'
interface OptRow { id?: string; label: string; disabled: boolean }
const KIND_TITLES: Record<Kind, string> = { SCHOOL: 'Schools', PROGRAM: 'Programs', FIELD: 'Preferred Field of Practice' }
const OPT_KINDS: Kind[] = ['SCHOOL', 'PROGRAM', 'FIELD']

// ══ Announcements (admin) ══════════════════════════════════════════
interface AdminAnnouncement { id: string; title: string; details: string; published: boolean; createdAt: string }

function AnnouncementsAdmin({ authHeaders }: { authHeaders: Record<string, string> }) {
  const [rows, setRows] = useState<AdminAnnouncement[] | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [nTitle, setNTitle] = useState('')
  const [nDetails, setNDetails] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch(`${API}/announcements/admin`, { headers: authHeaders })
    if (!r.ok) { setRows([]); return }
    const d = await r.json()
    setRows(d.announcements || [])
  }, [authHeaders])
  useEffect(() => { load() }, [load])

  async function create() {
    const title = nTitle.trim(), details = nDetails.trim()
    if (!title || !details) { setMsg({ ok: false, t: 'Please enter a title and details.' }); return }
    setBusy(true); setMsg(null)
    const r = await fetch(`${API}/announcements/admin`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ title, details }) })
    setBusy(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setMsg({ ok: false, t: d.error || 'Could not post the announcement.' }); return }
    setNTitle(''); setNDetails(''); setMsg({ ok: true, t: 'Posted — it is now live on the landing page.' })
    await load()
  }

  async function patch(id: string, data: Partial<Pick<AdminAnnouncement, 'title' | 'details' | 'published'>>): Promise<boolean> {
    const r = await fetch(`${API}/announcements/admin`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ id, ...data }) })
    if (!r.ok) { const d = await r.json().catch(() => ({})); setMsg({ ok: false, t: d.error || 'Could not update.' }); return false }
    await load(); return true
  }

  async function remove(id: string) {
    await fetch(`${API}/announcements/admin`, { method: 'DELETE', headers: authHeaders, body: JSON.stringify({ id }) })
    await load()
  }

  return (
    <div className={s.sec}>
      <p className={s.muted} style={{ margin: 0 }}>Post announcements that appear on the public <b>UGAT Fellowship</b> landing page. Each has a <b>title</b> and <b>details</b>. Unpublish to hide one without deleting it — newest shows first.</p>
      {msg && <div className={`${s.alert2} ${msg.ok ? s.alertOk2 : s.alertErr2}`}>{msg.t}</div>}

      <div className={s.card2}>
        <h3 className={s.card2H}>New announcement</h3>
        <div className={s.field}><input className={s.input} placeholder="Title (e.g. Cycle 2 applications now open!)" value={nTitle} maxLength={160} onChange={(e) => setNTitle(e.target.value)} /></div>
        <div className={s.field}><textarea className={s.textarea} rows={4} placeholder="Details…" value={nDetails} maxLength={4000} onChange={(e) => setNDetails(e.target.value)} /></div>
        <button className={s.btn2} disabled={busy} onClick={create}><Plus size={15} /> {busy ? 'Posting…' : 'Post announcement'}</button>
      </div>

      {rows === null ? <p className={s.muted}>Loading…</p>
        : rows.length === 0 ? <p className={s.muted}>No announcements yet.</p>
        : rows.map((a) => <AnnouncementRow key={a.id} a={a} onSave={patch} onDelete={remove} />)}
    </div>
  )
}

function AnnouncementRow({ a, onSave, onDelete }: { a: AdminAnnouncement; onSave: (id: string, data: Partial<Pick<AdminAnnouncement, 'title' | 'details' | 'published'>>) => Promise<boolean>; onDelete: (id: string) => void }) {
  const [title, setTitle] = useState(a.title)
  const [details, setDetails] = useState(a.details)
  const [saving, setSaving] = useState(false)
  const dirty = title.trim() !== a.title || details.trim() !== a.details

  async function save() {
    if (!dirty) return
    setSaving(true)
    await onSave(a.id, { title: title.trim(), details: details.trim() })
    setSaving(false)
  }

  return (
    <div className={s.card2}>
      <div className={s.annAdminHead}>
        <span className={a.published ? s.annPubBadge : s.annUnpubBadge}>{a.published ? 'Published' : 'Hidden'}</span>
        <span className={s.muted} style={{ fontSize: 12 }}>{new Date(a.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        <div className={s.annAdminBtns}>
          <button className={s.iconBtn} title={a.published ? 'Unpublish (hide from landing page)' : 'Publish'} onClick={() => onSave(a.id, { published: !a.published })}>{a.published ? <EyeOff size={15} /> : <Eye size={15} />}</button>
          <button className={`${s.iconBtn} ${s.iconDanger}`} title="Delete" onClick={() => { if (window.confirm('Delete this announcement? This cannot be undone.')) onDelete(a.id) }}><Trash2 size={15} /></button>
        </div>
      </div>
      <div className={s.field}><input className={s.input} value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} /></div>
      <div className={s.field}><textarea className={s.textarea} rows={3} value={details} maxLength={4000} onChange={(e) => setDetails(e.target.value)} /></div>
      {dirty && <button className={s.btn2} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save changes'}</button>}
    </div>
  )
}

function SettingsSection({ authHeaders }: { authHeaders: Record<string, string> }) {
  const [orig, setOrig] = useState<Record<Kind, OptRow[]> | null>(null)
  const [g, setG] = useState<Record<Kind, OptRow[]> | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)

  const load = useCallback(async () => {
    const r = await fetch(`${API}/admin/options`, { headers: authHeaders })
    if (!r.ok) return
    const d = await r.json()
    const norm = { SCHOOL: [], PROGRAM: [], FIELD: [] } as Record<Kind, OptRow[]>
    for (const k of OPT_KINDS) norm[k] = (d[k] || []).map((o: { id: string; label: string; disabled: boolean }) => ({ id: o.id, label: o.label, disabled: o.disabled }))
    setOrig(norm); setG(JSON.parse(JSON.stringify(norm)))
  }, [authHeaders])
  useEffect(() => { load() }, [load])

  const dirty = useMemo(() => JSON.stringify(orig) !== JSON.stringify(g), [orig, g])

  async function save() {
    if (!g || !orig) return
    setSaving(true); setMsg(null)
    try {
      for (const kind of OPT_KINDS) {
        const before = orig[kind], after = g[kind]
        for (const b of before) {
          if (b.id && !after.some((a) => a.id === b.id)) {
            await fetch(`${API}/admin/options`, { method: 'DELETE', headers: authHeaders, body: JSON.stringify({ id: b.id }) })
          }
        }
        for (const a of after) {
          const label = a.label.trim()
          if (!a.id) {
            if (label) await fetch(`${API}/admin/options`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ kind, label }) })
          } else {
            const b = before.find((x) => x.id === a.id)
            if (b && label && (b.label !== label || b.disabled !== a.disabled)) {
              await fetch(`${API}/admin/options`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ id: a.id, label, disabled: a.disabled }) })
            }
          }
        }
      }
      await load()
      setMsg({ ok: true, t: 'Saved — changes are now live for everyone.' })
    } catch {
      setMsg({ ok: false, t: 'Some changes could not be saved. Please try again.' })
    } finally { setSaving(false) }
  }

  function setKind(kind: Kind, rows: OptRow[]) { setG((prev) => (prev ? { ...prev, [kind]: rows } : prev)) }

  return (
    <div className={s.sec}>
      <div className={s.uaHead}>
        <p className={s.muted} style={{ margin: 0 }}>Set the schools we accept, programs, and preferred fields of practice — these populate the sign-up dropdowns. <b>Changes apply to everyone once you Save.</b> Disabled options are hidden from new applicants but preserved in existing records.</p>
        <div className={s.uaHeadBtns}>
          {dirty && <button className={s.btnGhost3} disabled={saving} onClick={() => orig && setG(JSON.parse(JSON.stringify(orig)))}>Discard</button>}
          <button className={s.btn2} disabled={saving || !dirty} onClick={save}>{saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button>
        </div>
      </div>
      {msg && <div className={`${s.alert2} ${msg.ok ? s.alertOk2 : s.alertErr2}`}>{msg.t}</div>}
      {dirty && !msg && <div className={`${s.alert2} ${s.alertWarn2}`}>You have unsaved changes — click <b>Save changes</b> to keep them.</div>}
      {g ? <div className={s.optGrid}>{OPT_KINDS.map((kind) => <OptionColumn key={kind} kind={kind} title={KIND_TITLES[kind]} rows={g[kind]} onChange={(rows) => setKind(kind, rows)} />)}</div> : <p className={s.muted}>Loading…</p>}
    </div>
  )
}
function OptionColumn({ kind, title, rows, onChange }: { kind: Kind; title: string; rows: OptRow[]; onChange: (rows: OptRow[]) => void }) {
  const [newLabel, setNewLabel] = useState('')
  function setLabel(i: number, label: string) { const c = rows.slice(); c[i] = { ...c[i], label }; onChange(c) }
  function toggle(i: number) { const c = rows.slice(); c[i] = { ...c[i], disabled: !c[i].disabled }; onChange(c) }
  function remove(i: number) { const c = rows.slice(); c.splice(i, 1); onChange(c) }
  function add() { const l = newLabel.trim(); if (!l) return; onChange([...rows, { label: l, disabled: false }]); setNewLabel('') }
  return (
    <div className={s.optCol}>
      <h3 className={s.optColH}>{title}</h3>
      {rows.length === 0 && <p className={s.muted} style={{ margin: 0 }}>No options yet.</p>}
      {rows.map((o, i) => (
        <div key={o.id || `new-${i}`} className={s.optRow}>
          <input className={`${s.optLabel} ${o.disabled ? s.optDisabled : ''}`} value={o.label} onChange={(e) => setLabel(i, e.target.value)} />
          <button type="button" className={s.iconBtn} title={o.disabled ? 'Enable' : 'Disable'} onClick={() => toggle(i)}>{o.disabled ? <Plus size={15} /> : <Ban size={15} />}</button>
          <button type="button" className={`${s.iconBtn} ${s.iconDanger}`} title="Remove" onClick={() => remove(i)}><Trash2 size={15} /></button>
        </div>
      ))}
      <div className={s.optAdd}><input value={newLabel} placeholder={`Add ${title.toLowerCase().replace(/s$/, '')}…`} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} /><button type="button" onClick={add}>Add</button></div>
    </div>
  )
}

// ══ User Access ════════════════════════════════════════════════════
interface StaffAdmin { id: string; username: string; name: string; kind: string; passwordPlain?: string | null; disabledAt?: string | null }
type NewType = 'staff_admin' | 'university_admin'

function UserAccess({ role, authHeaders }: { role: Role; authHeaders: Record<string, string> }) {
  const isMain = role === 'MAIN_ADMIN'
  const [admins, setAdmins] = useState<StaffAdmin[] | null>(null)
  const [scholars, setScholars] = useState<AdminScholar[] | null>(null)
  const [show, setShow] = useState(false)
  const [form, setForm] = useState<{ name: string; username: string; password: string; type: NewType }>({ name: '', username: '', password: '', type: 'staff_admin' })
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [a, sc] = await Promise.all([fetch(`${API}/admins`, { headers: authHeaders }), fetch(`${API}/scholars`, { headers: authHeaders })])
    if (a.ok) setAdmins((await a.json()).admins)
    if (sc.ok) setScholars((await sc.json()).scholars)
  }, [authHeaders])
  useEffect(() => { load() }, [load])

  async function addAdmin(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null)
    const r = await fetch(`${API}/admins`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ username: form.username, password: form.password, name: form.name, kind: form.type === 'university_admin' ? 'UNIVERSITY' : 'STAFF' }) })
    const d = await r.json().catch(() => ({})); setBusy(false)
    if (!r.ok) { setMsg({ ok: false, t: d.error || 'Could not add user.' }); return }
    setMsg({ ok: true, t: `${form.type === 'university_admin' ? 'University' : 'Staff'} admin @${form.username} created.` }); setForm({ name: '', username: '', password: '', type: 'staff_admin' }); load()
  }
  async function toggleAdmin(a: StaffAdmin) { await fetch(`${API}/admins`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ id: a.id, disabled: !a.disabledAt }) }); load() }
  async function removeAdmin(a: StaffAdmin) { if (!window.confirm(`Remove ${a.name} (@${a.username})? This cannot be undone.`)) return; await fetch(`${API}/admins`, { method: 'DELETE', headers: authHeaders, body: JSON.stringify({ id: a.id }) }); load() }
  async function resetAdminPw(a: StaffAdmin) { const p = window.prompt(`New password for @${a.username} (min 8 chars):`); if (!p) return; await fetch(`${API}/admins`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ id: a.id, password: p }) }); load() }
  async function toggleScholar(sc: AdminScholar) { await fetch(`${API}/scholars`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ id: sc.id, disabled: !sc.disabledAt }) }); load() }
  async function resetScholarPw(sc: AdminScholar) { const p = window.prompt(`New password for @${sc.username} (min 8 chars):`); if (!p) return; await fetch(`${API}/scholars`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ id: sc.id, newPassword: p }) }); load() }
  async function removeScholar(sc: AdminScholar) { if (!window.confirm(`Delete student ${sc.firstName} ${sc.lastName} (@${sc.username}) and ALL their data? This cannot be undone.`)) return; await fetch(`${API}/scholars`, { method: 'DELETE', headers: authHeaders, body: JSON.stringify({ id: sc.id }) }); load() }
  async function changeMyPassword() {
    const p = window.prompt('Enter your new password (minimum 8 characters):'); if (!p) return
    const r = await fetch(`${API}/admins`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ self: true, password: p }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { window.alert(d.error || 'Could not change your password.'); return }
    window.alert('Your password has been updated.'); load()
  }

  const pw = (v?: string | null) => show ? (v || '—') : '••••••••'

  return (
    <div className={s.sec}>
      <div className={s.uaHead}>
        <p className={s.muted} style={{ margin: 0 }}>All users, by account type. {isMain ? 'You can add, modify, and delete users.' : 'Only the main administrator can add or remove users — but you can change your own password.'}</p>
        <div className={s.uaHeadBtns}>
          {!isMain && <button className={s.btnGhost3} onClick={changeMyPassword}>Change my password</button>}
          <button className={s.btnGhost3} onClick={() => setShow((v) => !v)}>{show ? <><EyeOff size={15} /> Hide passwords</> : <><Eye size={15} /> Show passwords</>}</button>
        </div>
      </div>

      {isMain && (
        <form className={s.card2} onSubmit={addAdmin}>
          <h3 className={s.card2H}>Add an admin</h3>
          <div className={s.accessForm}>
            <select className={s.input2} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as NewType })}>
              <option value="staff_admin">Staff admin</option>
              <option value="university_admin">University admin</option>
            </select>
            <input className={s.input2} placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <input className={s.input2} placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
            <input className={s.input2} placeholder="Password (min. 8)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            <button className={s.btn2} disabled={busy}><Plus size={16} /> Add</button>
          </div>
          {msg && <div className={`${s.alert2} ${msg.ok ? s.alertOk2 : s.alertErr2}`}>{msg.t}</div>}
          <p className={s.muted} style={{ margin: '4px 2px 0' }}>Students register themselves on the sign-up page; you can reset or disable them below.</p>
        </form>
      )}

      <div className={s.card2}>
        <h3 className={s.card2H}>Administrators</h3>
        <div className={s.uaTableWrap}>
          <table className={s.uaTable}>
            <thead><tr><th>Type</th><th>Name</th><th>Username</th><th>Password</th><th></th></tr></thead>
            <tbody>
              <tr><td><span className={s.tagType}>Main admin</span></td><td>Main Administrator</td><td>@main</td><td className={s.mono}>{pw('scei')}</td><td className={s.muted}>built-in</td></tr>
              {admins?.map((a) => (
                <tr key={a.id} className={a.disabledAt ? s.rowDisabled : ''}>
                  <td><span className={s.tagType}>{a.kind === 'UNIVERSITY' ? 'University admin' : 'Staff admin'}</span></td>
                  <td>{a.name}</td><td>@{a.username}</td><td className={s.mono}>{pw(a.passwordPlain)}</td>
                  <td>{isMain && <div className={s.accessActions}><button className={s.miniBtn} onClick={() => resetAdminPw(a)}>Reset</button><button className={s.miniBtn} onClick={() => toggleAdmin(a)}>{a.disabledAt ? 'Enable' : 'Disable'}</button><button className={`${s.miniBtn} ${s.miniDanger}`} onClick={() => removeAdmin(a)}>Remove</button></div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={s.card2}>
        <h3 className={s.card2H}>Students</h3>
        <div className={s.uaTableWrap}>
          <table className={s.uaTable}>
            <thead><tr><th>Name</th><th>Username</th><th>Password</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {scholars?.map((sc) => (
                <tr key={sc.id} className={sc.disabledAt ? s.rowDisabled : ''}>
                  <td>{[sc.firstName, sc.lastName].filter(Boolean).join(' ')}</td><td>@{sc.username}</td>
                  <td className={s.mono}>{pw(sc.passwordPlain)}</td>
                  <td><span className={`${s.statusPill} ${STATUS_CLASS[sc.status] || ''}`}>{STATUS_LABEL[sc.status] || sc.status}</span></td>
                  <td><div className={s.accessActions}><button className={s.miniBtn} onClick={() => resetScholarPw(sc)}>Reset</button><button className={s.miniBtn} onClick={() => toggleScholar(sc)}>{sc.disabledAt ? 'Enable' : 'Disable'}</button>{isMain && <button className={`${s.miniBtn} ${s.miniDanger}`} onClick={() => removeScholar(sc)}>Delete</button>}</div></td>
                </tr>
              ))}
              {scholars && scholars.length === 0 && <tr><td colSpan={5} className={s.muted} style={{ padding: 14 }}>No students yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
