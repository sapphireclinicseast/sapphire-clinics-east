'use client'

// The authenticated UGAT hub: a role-gated left sidebar + section content.
// One shell serves scholars and admins; SECTIONS[].roles decides visibility.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Info, User, FileText, LayoutDashboard, GraduationCap, Settings as SettingsIcon,
  ShieldCheck, LogOut, Menu, X, CheckCircle2, Ban, Trash2, Plus,
} from 'lucide-react'
import s from './ugat.module.css'

const API = '/api/public/ugat'

type Role = 'MAIN_ADMIN' | 'STAFF_ADMIN' | 'SCHOLAR'

export interface PortalScholar {
  id: string; username: string; professionalEmail: string; personalEmail: string
  firstName: string; middleName?: string | null; lastName: string; studentNumber: string
  birthdate?: string; school: string; program: string; preferredField: string
  expectedGraduationYear: number; status: string
  permAddress1: string; permAddress2?: string | null; permCity: string; permRegion: string; permZip: string
  presAddress1: string; presAddress2?: string | null; presCity: string; presRegion: string; presZip: string
  createdAt?: string
}
export interface PortalAdmin { username: string; name: string }
export interface PortalSession { role: Role; scholar?: PortalScholar; admin?: PortalAdmin }

type SectionKey = 'about' | 'profile' | 'application' | 'dashboard' | 'schools' | 'settings' | 'access'

const SECTIONS: { key: SectionKey; label: string; icon: React.ElementType; roles: Role[] }[] = [
  { key: 'about', label: 'About Us', icon: Info, roles: ['SCHOLAR', 'STAFF_ADMIN', 'MAIN_ADMIN'] },
  { key: 'profile', label: 'Profile', icon: User, roles: ['SCHOLAR', 'STAFF_ADMIN', 'MAIN_ADMIN'] },
  { key: 'application', label: 'Application', icon: FileText, roles: ['SCHOLAR', 'STAFF_ADMIN', 'MAIN_ADMIN'] },
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['STAFF_ADMIN', 'MAIN_ADMIN'] },
  { key: 'schools', label: 'Schools Data', icon: GraduationCap, roles: ['SCHOLAR', 'STAFF_ADMIN', 'MAIN_ADMIN'] },
  { key: 'settings', label: 'Settings', icon: SettingsIcon, roles: ['STAFF_ADMIN', 'MAIN_ADMIN'] },
  { key: 'access', label: 'User Access', icon: ShieldCheck, roles: ['STAFF_ADMIN', 'MAIN_ADMIN'] },
]

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

  const isAdmin = role === 'MAIN_ADMIN' || role === 'STAFF_ADMIN'
  const displayName = isAdmin ? (session.admin?.name || 'Administrator') : (session.scholar?.firstName || 'Scholar')
  const handle = isAdmin ? session.admin?.username : session.scholar?.username

  return (
    <div className={s.portal}>
      {navOpen && <div className={s.navScrim} onClick={() => setNavOpen(false)} />}
      <aside className={`${s.side} ${navOpen ? s.sideOpen : ''}`}>
        <div className={s.sideBrand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ugat/ugat-mark.svg" alt="" className={s.sideMark} />
          <div className={s.sideBrandText}>
            <b>UGAT Fellowship</b>
            <span>Aura Foundation</span>
          </div>
          <button className={s.sideClose} onClick={() => setNavOpen(false)} aria-label="Close menu"><X size={20} /></button>
        </div>

        <nav className={s.sideNav}>
          {allowed.map((sec) => {
            const Icon = sec.icon
            return (
              <button
                key={sec.key}
                className={`${s.navItem} ${active === sec.key ? s.navItemActive : ''}`}
                onClick={() => { setActive(sec.key); setNavOpen(false) }}
              >
                <Icon size={18} strokeWidth={2} /><span>{sec.label}</span>
              </button>
            )
          })}
        </nav>

        <div className={s.sideFoot}>
          <div className={s.sideUser}>
            <div className={s.sideAvatar}>{displayName.charAt(0).toUpperCase()}</div>
            <div className={s.sideUserText}>
              <b>{displayName}</b>
              <span>{role === 'MAIN_ADMIN' ? 'Main Admin' : role === 'STAFF_ADMIN' ? 'Staff Admin' : 'Scholar'}{handle ? ` · @${handle}` : ''}</span>
            </div>
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
          {active === 'profile' && <Profile session={session} />}
          {active === 'application' && <Application session={session} onGoTo={setActive} />}
          {active === 'dashboard' && <Dashboard authHeaders={authHeaders} />}
          {active === 'schools' && <SchoolsData />}
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
        <p className={s.aboutKicker}>Ugnayan para sa Galing, Aral, at Tindig</p>
        <h2 className={s.aboutH1}>Grow where your roots are honored.</h2>
        <p className={s.aboutLead}>
          The <b>UGAT Fellowship Program</b> is Aura Foundation&rsquo;s allowance-based fellowship for
          Allied Health Professionals — Speech-Language Pathology and Occupational Therapy interns — in
          their final year of university. Run <b>in coordination with your University</b>, it walks with
          you through your clinical internship and into your first years as a licensed professional.
        </p>
      </div>

      <div className={s.aboutGrid}>
        <div className={s.aboutCard}>
          <h3>A monthly stipend while you train</h3>
          <p>
            Fellows receive a monthly financial allowance of <b>₱10,000</b> for up to <b>ten (10) months</b>
            throughout their clinical internship — support that lets you focus on becoming an excellent
            clinician instead of worrying about how to get there.
          </p>
        </div>
        <div className={s.aboutCard}>
          <h3>Mentorship at Aura Health Rehab</h3>
          <p>
            You train and grow alongside our supervising therapists across Aura Health Rehab&rsquo;s
            <b> East</b> and <b>Greenhills</b> branches — real caseloads, real supervision, and a team that
            genuinely invests in your craft (<i>galing</i>).
          </p>
        </div>
        <div className={s.aboutCard}>
          <h3>A guaranteed runway into your career</h3>
          <p>
            After you pass your licensure, you give back through <b>return service</b> — practicing as a
            fully-compensated licensed clinician at Aura, at standard market pay. It&rsquo;s not a deduction;
            it&rsquo;s a head start: a place waiting for you the day you become licensed.
          </p>
        </div>
        <div className={s.aboutCard}>
          <h3>Values that stay grounded</h3>
          <p>
            Much like strong roots (<i>ugat</i>), we hope our fellows stay grounded in their values as they
            grow — pursuing excellence (<i>galing</i>), upholding honor and integrity (<i>tindig</i>), and
            ultimately giving back through meaningful service (<i>paglilingkod</i>) to the community.
          </p>
        </div>
      </div>

      <div className={s.aboutNote}>
        <h3>How the fellowship works</h3>
        <ul>
          <li>Offered to qualified final-year SLP and OT interns, coursed through your University.</li>
          <li>Monthly allowance during your School Year internship; coordinated with your school calendar.</li>
          <li>Upon licensure, you render return-service clinical hours at Aura Health Rehab as a licensed,
            fully-paid professional — with a Certificate of Completion at the end and the option to stay on.</li>
          <li>Handled with fairness and compassion, consistent with the <b>Data Privacy Act of 2012</b>.</li>
        </ul>
        <p className={s.aboutTimeline}>
          <b>Applications</b> are accepted January–April · <b>deliberations</b> May–June ·
          <b> scholars announced</b> in July. Extensions are usually announced.
        </p>
      </div>

      <div className={s.aboutPartner}>
        Interested to have your school partner with us for accepting fellows for Speech-Language Pathology
        or Occupational Therapy? Contact us at <a href="mailto:scholarship@sapphireclinicseast.org">scholarship@sapphireclinicseast.org</a>.
      </div>
    </div>
  )
}

// ══ Profile ════════════════════════════════════════════════════════
function Profile({ session }: { session: PortalSession }) {
  if (session.role !== 'SCHOLAR' || !session.scholar) {
    return (
      <div className={s.sec}>
        <div className={s.card2}>
          <h3 className={s.card2H}>{session.admin?.name}</h3>
          <p className={s.muted}>You are signed in as {session.role === 'MAIN_ADMIN' ? 'the main administrator' : 'a staff administrator'} (@{session.admin?.username}). Administrator accounts don&rsquo;t have a scholar profile — use <b>User Access</b> to manage accounts and <b>Dashboard</b> to review applicants.</p>
        </div>
      </div>
    )
  }
  const sc = session.scholar
  const fullName = [sc.firstName, sc.middleName, sc.lastName].filter(Boolean).join(' ')
  const perm = [sc.permAddress1, sc.permAddress2, sc.permCity, sc.permRegion, sc.permZip].filter(Boolean).join(', ')
  const pres = [sc.presAddress1, sc.presAddress2, sc.presCity, sc.presRegion, sc.presZip].filter(Boolean).join(', ')
  const rows: [string, string | number][] = [
    ['Full name', fullName],
    ['Username', '@' + sc.username],
    ['Student number', sc.studentNumber],
    ['School', sc.school],
    ['Program', sc.program],
    ['Preferred field of practice', sc.preferredField],
    ['Expected graduation', sc.expectedGraduationYear],
    ['Professional email', sc.professionalEmail],
    ['Personal email', sc.personalEmail],
    ['Permanent address', perm],
    ['Present address', pres],
  ]
  return (
    <div className={s.sec}>
      <div className={s.card2}>
        <h3 className={s.card2H}>Your details</h3>
        <p className={s.muted}>This is the information on file for your fellowship account. To correct any of it, contact <a href="mailto:scholarship@sapphireclinicseast.org">scholarship@sapphireclinicseast.org</a>.</p>
        <dl className={s.defList}>
          {rows.map(([k, v]) => (
            <div key={k} className={s.defRow}><dt>{k}</dt><dd>{v || '—'}</dd></div>
          ))}
        </dl>
      </div>
    </div>
  )
}

// ══ Application ════════════════════════════════════════════════════
const STATUS_LABEL: Record<string, string> = {
  APPLIED: 'Application received', ACCEPTED: 'Accepted', WAITLISTED: 'Waitlisted', REJECTED: 'Not selected',
}
const STATUS_CLASS: Record<string, string> = {
  APPLIED: s.stApplied, ACCEPTED: s.stAccepted, WAITLISTED: s.stWait, REJECTED: s.stRejected,
}
function Application({ session, onGoTo }: { session: PortalSession; onGoTo: (k: SectionKey) => void }) {
  if (session.role !== 'SCHOLAR' || !session.scholar) {
    return (
      <div className={s.sec}>
        <div className={s.card2}>
          <h3 className={s.card2H}>Applications</h3>
          <p className={s.muted}>Applicant records and their statuses are managed on the <button className={s.linkBtn2} onClick={() => onGoTo('dashboard')}>Dashboard</button>.</p>
        </div>
      </div>
    )
  }
  const sc = session.scholar
  const st = sc.status || 'APPLIED'
  const steps = [
    { t: 'Application submitted', done: true },
    { t: 'Under deliberation (May–June)', done: st === 'ACCEPTED' || st === 'REJECTED' || st === 'WAITLISTED' },
    { t: 'Decision released (July)', done: st === 'ACCEPTED' || st === 'REJECTED' },
  ]
  return (
    <div className={s.sec}>
      <div className={s.card2}>
        <div className={s.appHead}>
          <h3 className={s.card2H} style={{ margin: 0 }}>Your application</h3>
          <span className={`${s.statusPill} ${STATUS_CLASS[st] || ''}`}>{STATUS_LABEL[st] || st}</span>
        </div>
        <p className={s.muted}>
          {st === 'ACCEPTED'
            ? 'Congratulations! You have been accepted into the UGAT Fellowship. Our team will reach out with your onboarding and Return Service Agreement details.'
            : st === 'WAITLISTED'
            ? 'You are currently on the waitlist. We will notify you by email if a slot opens.'
            : st === 'REJECTED'
            ? 'Thank you for applying. You were not selected this cycle — extensions and future cycles are usually announced, and we hope you apply again.'
            : 'Your application has been received and is being processed. Deliberations are held May–June, with scholars announced in July.'}
        </p>
        <ol className={s.steps}>
          {steps.map((x, i) => (
            <li key={i} className={x.done ? s.stepDone : ''}>{x.done && <CheckCircle2 size={16} />}<span>{x.t}</span></li>
          ))}
        </ol>
      </div>
      <div className={s.card2}>
        <h3 className={s.card2H}>Program summary</h3>
        <dl className={s.defList}>
          <div className={s.defRow}><dt>Program</dt><dd>{sc.program}</dd></div>
          <div className={s.defRow}><dt>School</dt><dd>{sc.school}</dd></div>
          <div className={s.defRow}><dt>Preferred field</dt><dd>{sc.preferredField}</dd></div>
          <div className={s.defRow}><dt>Expected graduation</dt><dd>{sc.expectedGraduationYear}</dd></div>
        </dl>
      </div>
    </div>
  )
}

// ══ Dashboard (admin) ══════════════════════════════════════════════
interface AdminScholar {
  id: string; username: string; professionalEmail: string; personalEmail: string
  firstName: string; middleName?: string | null; lastName: string; studentNumber: string
  school: string; program: string; preferredField: string; expectedGraduationYear: number
  status: string; emailVerifiedAt?: string | null; disabledAt?: string | null; createdAt: string
}
const STATUSES = ['APPLIED', 'ACCEPTED', 'WAITLISTED', 'REJECTED']

function Dashboard({ authHeaders }: { authHeaders: Record<string, string> }) {
  const [rows, setRows] = useState<AdminScholar[] | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [filter, setFilter] = useState('ALL')

  const load = useCallback(async () => {
    const r = await fetch(`${API}/scholars`, { headers: authHeaders })
    if (r.ok) { const d = await r.json(); setRows(d.scholars); setCounts(d.counts) }
  }, [authHeaders])
  useEffect(() => { load() }, [load])

  async function setStatus(id: string, status: string) {
    setRows((rs) => rs?.map((x) => (x.id === id ? { ...x, status } : x)) || rs)
    await fetch(`${API}/scholars`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ id, status }) })
    load()
  }

  if (!rows) return <div className={s.sec}><p className={s.muted}>Loading…</p></div>
  const shown = filter === 'ALL' ? rows : rows.filter((r) => r.status === filter)

  return (
    <div className={s.sec}>
      <div className={s.statRow}>
        <Stat label="Total" value={counts.TOTAL || 0} />
        <Stat label="Verified" value={counts.VERIFIED || 0} />
        <Stat label="Applied" value={counts.APPLIED || 0} />
        <Stat label="Accepted" value={counts.ACCEPTED || 0} accent />
        <Stat label="Waitlisted" value={counts.WAITLISTED || 0} />
        <Stat label="Not selected" value={counts.REJECTED || 0} />
      </div>

      <div className={s.tableTools}>
        <div className={s.chips}>
          {['ALL', ...STATUSES].map((k) => (
            <button key={k} className={`${s.chip} ${filter === k ? s.chipActive : ''}`} onClick={() => setFilter(k)}>
              {k === 'ALL' ? 'All' : STATUS_LABEL[k]}
            </button>
          ))}
        </div>
      </div>

      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr><th>Applicant</th><th>School / Program</th><th>Field</th><th>Grad</th><th>Verified</th><th>Status</th></tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={6} className={s.muted} style={{ padding: 20 }}>No applicants{filter !== 'ALL' ? ' in this status' : ' yet'}.</td></tr>}
            {shown.map((r) => (
              <tr key={r.id} className={r.disabledAt ? s.rowDisabled : ''}>
                <td>
                  <div className={s.cellName}>{[r.firstName, r.lastName].filter(Boolean).join(' ')}</div>
                  <div className={s.cellSub}>@{r.username} · {r.personalEmail}</div>
                </td>
                <td>
                  <div>{r.school}</div>
                  <div className={s.cellSub}>{r.program}</div>
                </td>
                <td>{r.preferredField}</td>
                <td>{r.expectedGraduationYear}</td>
                <td>{r.emailVerifiedAt ? <CheckCircle2 size={16} className={s.okIcon} /> : <span className={s.muted}>—</span>}</td>
                <td>
                  <select className={s.statusSelect} value={r.status} onChange={(e) => setStatus(r.id, e.target.value)}>
                    {STATUSES.map((st) => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`${s.stat} ${accent ? s.statAccent : ''}`}>
      <div className={s.statValue}>{value}</div>
      <div className={s.statLabel}>{label}</div>
    </div>
  )
}

// ══ Schools Data (embedded, same-origin) ═══════════════════════════
function SchoolsData() {
  return (
    <div className={s.secFlush}>
      <iframe className={s.embed} src="/school-data/" title="OT / SLP Schools Data" loading="lazy" />
    </div>
  )
}

// ══ Settings — dropdown options editor (admin) ═════════════════════
type Kind = 'SCHOOL' | 'PROGRAM' | 'FIELD'
interface Opt { id: string; label: string; sortOrder: number; disabled: boolean }
const KIND_TITLES: Record<Kind, string> = { SCHOOL: 'Schools', PROGRAM: 'Programs', FIELD: 'Preferred Field of Practice' }

function SettingsSection({ authHeaders }: { authHeaders: Record<string, string> }) {
  const [groups, setGroups] = useState<Record<Kind, Opt[]> | null>(null)
  const load = useCallback(async () => {
    const r = await fetch(`${API}/admin/options`, { headers: authHeaders })
    if (r.ok) setGroups(await r.json())
  }, [authHeaders])
  useEffect(() => { load() }, [load])

  return (
    <div className={s.sec}>
      <p className={s.muted}>Edit the dropdown choices shown on the scholar sign-up form. Changes take effect immediately. Disabled options are hidden from new applicants but preserved in existing records.</p>
      {groups ? (
        <div className={s.optGrid}>
          {(Object.keys(KIND_TITLES) as Kind[]).map((kind) => (
            <OptionColumn key={kind} kind={kind} title={KIND_TITLES[kind]} items={groups[kind] || []} authHeaders={authHeaders} reload={load} />
          ))}
        </div>
      ) : <p className={s.muted}>Loading…</p>}
    </div>
  )
}
function OptionColumn({ kind, title, items, authHeaders, reload }: { kind: Kind; title: string; items: Opt[]; authHeaders: Record<string, string>; reload: () => void }) {
  const [newLabel, setNewLabel] = useState('')
  const [busy, setBusy] = useState(false)
  async function add() {
    const label = newLabel.trim(); if (!label) return
    setBusy(true)
    await fetch(`${API}/admin/options`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ kind, label }) })
    setNewLabel(''); setBusy(false); reload()
  }
  async function rename(id: string, label: string, original: string) {
    if (label.trim() === original || !label.trim()) return
    await fetch(`${API}/admin/options`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ id, label: label.trim() }) }); reload()
  }
  async function toggle(id: string, disabled: boolean) {
    await fetch(`${API}/admin/options`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ id, disabled: !disabled }) }); reload()
  }
  async function remove(id: string, label: string) {
    if (!window.confirm(`Delete “${label}”? Existing scholar records keep their saved value.`)) return
    await fetch(`${API}/admin/options`, { method: 'DELETE', headers: authHeaders, body: JSON.stringify({ id }) }); reload()
  }
  return (
    <div className={s.optCol}>
      <h3 className={s.optColH}>{title}</h3>
      {items.length === 0 && <p className={s.muted} style={{ margin: 0 }}>No options yet.</p>}
      {items.map((o) => (
        <div key={o.id} className={s.optRow}>
          <input className={`${s.optLabel} ${o.disabled ? s.optDisabled : ''}`} defaultValue={o.label} onBlur={(e) => rename(o.id, e.target.value, o.label)} />
          <button className={s.iconBtn} title={o.disabled ? 'Enable' : 'Disable'} onClick={() => toggle(o.id, o.disabled)}>{o.disabled ? <Plus size={15} /> : <Ban size={15} />}</button>
          <button className={`${s.iconBtn} ${s.iconDanger}`} title="Delete" onClick={() => remove(o.id, o.label)}><Trash2 size={15} /></button>
        </div>
      ))}
      <div className={s.optAdd}>
        <input value={newLabel} placeholder={`Add ${title.toLowerCase().replace(/s$/, '')}…`} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
        <button onClick={add} disabled={busy}>Add</button>
      </div>
    </div>
  )
}

// ══ User Access (admin) ════════════════════════════════════════════
interface StaffAdmin { id: string; username: string; name: string; createdAt: string; createdBy?: string | null; disabledAt?: string | null }
function UserAccess({ role, authHeaders }: { role: Role; authHeaders: Record<string, string> }) {
  const isMain = role === 'MAIN_ADMIN'
  const [admins, setAdmins] = useState<StaffAdmin[] | null>(null)
  const [scholars, setScholars] = useState<AdminScholar[] | null>(null)
  const [form, setForm] = useState({ name: '', username: '', password: '' })
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [a, sc] = await Promise.all([
      fetch(`${API}/admins`, { headers: authHeaders }),
      fetch(`${API}/scholars`, { headers: authHeaders }),
    ])
    if (a.ok) setAdmins((await a.json()).admins)
    if (sc.ok) setScholars((await sc.json()).scholars)
  }, [authHeaders])
  useEffect(() => { load() }, [load])

  async function addAdmin(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null)
    const r = await fetch(`${API}/admins`, { method: 'POST', headers: authHeaders, body: JSON.stringify(form) })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setMsg({ ok: false, t: d.error || 'Could not add admin.' }); return }
    setMsg({ ok: true, t: `Staff admin @${form.username} created.` }); setForm({ name: '', username: '', password: '' }); load()
  }
  async function toggleAdmin(a: StaffAdmin) {
    await fetch(`${API}/admins`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ id: a.id, disabled: !a.disabledAt }) }); load()
  }
  async function removeAdmin(a: StaffAdmin) {
    if (!window.confirm(`Remove staff admin “${a.name}” (@${a.username})? This cannot be undone.`)) return
    await fetch(`${API}/admins`, { method: 'DELETE', headers: authHeaders, body: JSON.stringify({ id: a.id }) }); load()
  }
  async function toggleScholar(sc: AdminScholar) {
    await fetch(`${API}/scholars`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ id: sc.id, disabled: !sc.disabledAt }) }); load()
  }

  return (
    <div className={s.sec}>
      <div className={s.card2}>
        <h3 className={s.card2H}>Staff administrators</h3>
        <p className={s.muted}>Staff admins can view every section. Only the <b>main administrator</b> can add, disable, or remove them. The main account (<b>@main</b>) is built-in and always active.</p>

        {isMain && (
          <form className={s.accessForm} onSubmit={addAdmin}>
            <input className={s.input2} placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <input className={s.input2} placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
            <input className={s.input2} type="password" placeholder="Password (min. 8)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            <button className={s.btn2} disabled={busy}><Plus size={16} /> Add staff admin</button>
          </form>
        )}
        {msg && <div className={`${s.alert2} ${msg.ok ? s.alertOk2 : s.alertErr2}`}>{msg.t}</div>}

        <div className={s.accessList}>
          <div className={`${s.accessItem} ${s.accessMain}`}>
            <div><b>Main Administrator</b><span className={s.cellSub}>@main · built-in</span></div>
            <span className={s.tagOk}>Active</span>
          </div>
          {admins?.map((a) => (
            <div key={a.id} className={s.accessItem}>
              <div><b>{a.name}</b><span className={s.cellSub}>@{a.username}{a.disabledAt ? ' · disabled' : ''}</span></div>
              {isMain ? (
                <div className={s.accessActions}>
                  <button className={s.miniBtn} onClick={() => toggleAdmin(a)}>{a.disabledAt ? 'Enable' : 'Disable'}</button>
                  <button className={`${s.miniBtn} ${s.miniDanger}`} onClick={() => removeAdmin(a)}>Remove</button>
                </div>
              ) : <span className={a.disabledAt ? s.tagOff : s.tagOk}>{a.disabledAt ? 'Disabled' : 'Active'}</span>}
            </div>
          ))}
          {admins && admins.length === 0 && <p className={s.muted} style={{ margin: '6px 2px' }}>No staff admins yet.</p>}
        </div>
      </div>

      <div className={s.card2}>
        <h3 className={s.card2H}>Scholar accounts</h3>
        <p className={s.muted}>Disable an account to block sign-in without deleting its records.</p>
        <div className={s.accessList}>
          {scholars?.map((sc) => (
            <div key={sc.id} className={s.accessItem}>
              <div><b>{[sc.firstName, sc.lastName].filter(Boolean).join(' ')}</b><span className={s.cellSub}>@{sc.username} · {sc.school}{sc.disabledAt ? ' · disabled' : ''}</span></div>
              <div className={s.accessActions}>
                <span className={`${s.statusPill} ${STATUS_CLASS[sc.status] || ''}`}>{STATUS_LABEL[sc.status] || sc.status}</span>
                <button className={s.miniBtn} onClick={() => toggleScholar(sc)}>{sc.disabledAt ? 'Enable' : 'Disable'}</button>
              </div>
            </div>
          ))}
          {scholars && scholars.length === 0 && <p className={s.muted} style={{ margin: '6px 2px' }}>No scholar accounts yet.</p>}
        </div>
      </div>
    </div>
  )
}
