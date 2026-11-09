'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import {
  DashCard, EmptyState, PageHeader, PillTabs, Skeleton, Tag,
  BTN_DANGER_GHOST, BTN_PRIMARY, BTN_SECONDARY, BTN_SM, CARD_STYLE, CONTROL, CONTROL_STYLE, DANGER, FOCUS,
  LABEL, LABEL_STYLE, PAGE, PRIMARY_STYLE, SECONDARY_STYLE, SUBTLE_BG, TEXTAREA, TH, TH_STYLE,
} from '@/components/hub/ui'
import { Contact, Plus, Trash2, Loader2, X, Mail, Lock, Pencil, Globe, Building2, Save, ExternalLink, Search, ChevronUp, ChevronDown, ChevronsUpDown, MessageCircle, Phone } from 'lucide-react'

type SortState = { col: string; dir: 'asc' | 'desc' }

// Clickable column header that toggles asc → desc → asc on the given column.
function SortableTh({ label, col, sort, onToggle, className }: { label: string; col: string; sort: SortState; onToggle: (c: string) => void; className?: string }) {
  const active = sort.col === col
  return (
    <th scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`${TH} !px-5 ${className ?? ''}`} style={{ ...TH_STYLE, ...(active ? { color: 'var(--deep-teal)' } : null) }}>
      <button type="button" onClick={() => onToggle(col)} className={`inline-flex items-center gap-1 uppercase tracking-wider rounded hover:text-[var(--deep-teal)] ${FOCUS}`}>
        {label}
        {active ? (sort.dir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : <ChevronsUpDown size={13} className="opacity-30" />}
      </button>
    </th>
  )
}

interface DirectoryEntry {
  id: string
  departments: string[]
  branches: string[]
  email: string | null
  description: string | null
  restricted?: boolean
  visibleBranches?: string[]
  emailHidden?: boolean
}
interface WebsiteEntry {
  id: string
  link: string | null
  description: string | null
  restricted?: boolean
  visibleBranches?: string[]
  linkHidden?: boolean
}
interface BranchInfoItem { branch: string; info: string }

const DEPT_LABELS: Record<string, string> = {
  OT: 'Occupational Therapy', PT: 'Physical Therapy', SLP: 'Speech-Language Pathology',
  SPED: 'Special Education', MD: 'Medical (MD)', PSYCHOLOGY: 'Psychology',
  ORTHOSIS: 'Orthosis', FRONT_DESK: 'Front Desk', ADMINISTRATION: 'Administration',
}
const DEPT_ORDER = ['OT', 'PT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY', 'ORTHOSIS', 'FRONT_DESK', 'ADMINISTRATION']
const BRANCH_LABELS: Record<string, string> = { EAST: 'East', GREENHILLS: 'Greenhills', VERDANA: 'Verdana', CORPORATE: 'Corporate' }
// Public patient-facing contact channels per branch (fixed brand handles).
const BRANCH_CONTACTS: Record<string, { messenger: string; viberNumber: string; viberDisplay: string }> = {
  EAST: { messenger: 'https://m.me/aurahealthrehabeast', viberNumber: '+639171189289', viberDisplay: '+63 917 118 9289' },
  GREENHILLS: { messenger: 'https://m.me/aurahealthrehabgh', viberNumber: '+639177701686', viberDisplay: '+63 917 770 1686' },
}
const BRANCH_ORDER = ['EAST', 'GREENHILLS', 'VERDANA', 'CORPORATE']

// HR forms that have fillable online versions — shown as scannable QR cards at
// the top of the Directory. QR SVGs are pre-generated in /public/forms-qr.
const HR_BASE = 'https://hr.sapphireclinicseast.org'
const FORM_QRS = [
  { id: 'hr03', code: 'HR03', name: 'Grievance Form', path: '/concern-form.html' },
  { id: 'hr06', code: 'HR06', name: 'Incident Report Form', path: '/patient-complaint-form.html' },
  { id: 'hr19', code: 'HR19', name: 'Staff Feedback Form', path: '/forms/fill/uK3npNQ1' },
  { id: 'hr20', code: 'HR20', name: 'Staff Referral Form', path: '/forms/fill/QHfTVwaX' },
  { id: 'hr21', code: 'HR21', name: 'Payroll Revision Request', path: '/forms/fill/byKlxWS6' },
]

const sortDepts = (ds: string[]) => [...ds].sort((a, b) => DEPT_ORDER.indexOf(a) - DEPT_ORDER.indexOf(b))
const sortBranches = (bs: string[]) => [...bs].sort((a, b) => BRANCH_ORDER.indexOf(a) - BRANCH_ORDER.indexOf(b))

// Reusable "Visible To" cell content.
function VisibleTo({ visibleBranches }: { visibleBranches?: string[] }) {
  const list = visibleBranches ?? []
  if (list.length === 0) return <span className="text-[12px] text-[var(--mid-gray)]">Everyone</span>
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      <Lock size={12} className="text-[var(--mid-gray)] shrink-0" />
      {sortBranches(list).map((b) => (
        <Tag key={b} tone="brand">{BRANCH_LABELS[b] ?? b}</Tag>
      ))}
    </div>
  )
}

// Branch-checkbox grid for visibility selection (reused by both forms).
function BranchPicker({ selected, onToggle, accent = 'moss' }: { selected: string[]; onToggle: (b: string) => void; accent?: 'moss' | 'gold' }) {
  const onBg = accent === 'gold' ? 'var(--sun-tint)' : 'var(--sage-tint)'
  const onBorder = accent === 'gold' ? 'var(--gold)' : 'var(--moss)'
  const onMark = accent === 'gold' ? 'var(--gold)' : 'var(--moss)'
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {BRANCH_ORDER.map((b) => {
        const on = selected.includes(b)
        return (
          <button key={b} type="button" onClick={() => onToggle(b)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-[13px] transition-colors"
            style={on ? { background: onBg, borderColor: onBorder, color: 'var(--deep-teal)' } : { background: '#fff', borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
            <span className="w-4 h-4 rounded flex items-center justify-center shrink-0 text-white text-[11px] font-bold"
              style={{ background: on ? onMark : 'transparent', border: on ? 'none' : '1.5px solid var(--light-gray)' }}>{on ? '✓' : ''}</span>
            {BRANCH_LABELS[b] ?? b}
          </button>
        )
      })}
    </div>
  )
}

type Tab = 'branch' | 'emails' | 'websites'

export default function DirectoryPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'ADMIN'
  const [tab, setTab] = useState<Tab>('branch')
  const [toast, setToast] = useState<string | null>(null)
  function flash(m: string) { setToast(m); setTimeout(() => setToast(null), 2800) }

  // ── Branch Information ──────────────────────────────────────────
  const [branchInfo, setBranchInfo] = useState<BranchInfoItem[]>([])
  const [branchDraft, setBranchDraft] = useState<Record<string, string>>({})
  const [savingBranch, setSavingBranch] = useState<string | null>(null)
  async function loadBranchInfo() {
    const res = await fetch('/api/directory/branch-info')
    if (res.ok) {
      const data = await res.json()
      setBranchInfo(data.info ?? [])
      const d: Record<string, string> = {}
      ;(data.info ?? []).forEach((x: BranchInfoItem) => { d[x.branch] = x.info })
      setBranchDraft(d)
    }
  }
  async function saveBranch(branch: string) {
    setSavingBranch(branch)
    try {
      const res = await fetch('/api/directory/branch-info', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, info: branchDraft[branch] ?? '' }),
      })
      if (res.ok) { flash(`${BRANCH_LABELS[branch]} info saved`); loadBranchInfo() }
      else flash('Failed to save')
    } catch { flash('Failed to save') }
    setSavingBranch(null)
  }

  // ── Emails ──────────────────────────────────────────────────────
  const [entries, setEntries] = useState<DirectoryEntry[]>([])
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [editEmailId, setEditEmailId] = useState<string | null>(null)
  const [depts, setDepts] = useState<string[]>([])
  const [branchSel, setBranchSel] = useState<string[]>([])
  const [email, setEmail] = useState('')
  const [emailDesc, setEmailDesc] = useState('')
  const [restrictView, setRestrictView] = useState(false)
  const [viewSel, setViewSel] = useState<string[]>([])
  const [savingEmail, setSavingEmail] = useState(false)
  const [emailQ, setEmailQ] = useState('')
  const [emailSort, setEmailSort] = useState<SortState>({ col: '', dir: 'asc' })
  const emailFormRef = useRef<HTMLDivElement | null>(null)
  // The edit form sits at the top of the tab, above the table. When a
  // pencil on a lower row opens it, scroll it into view — otherwise the
  // form opens off-screen above and it looks like nothing happened.
  useEffect(() => {
    if (showEmailForm && editEmailId) emailFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [showEmailForm, editEmailId])
  async function loadEmails() {
    const res = await fetch('/api/directory')
    if (res.ok) setEntries((await res.json()).entries ?? [])
  }
  function resetEmailForm() {
    setEditEmailId(null); setDepts([]); setBranchSel([]); setEmail(''); setEmailDesc('')
    setRestrictView(false); setViewSel([]); setShowEmailForm(false)
  }
  function startEditEmail(e: DirectoryEntry) {
    setEditEmailId(e.id); setDepts(e.departments ?? []); setBranchSel(e.branches ?? [])
    setEmail(e.email ?? ''); setEmailDesc(e.description ?? '')
    const vb = e.visibleBranches ?? []
    setRestrictView(vb.length > 0); setViewSel(vb); setShowEmailForm(true)
  }
  async function saveEmail() {
    if (depts.length === 0) { flash('Select at least one department'); return }
    if (branchSel.length === 0) { flash('Select at least one branch'); return }
    if (!email) { flash('Email is required'); return }
    if (restrictView && viewSel.length === 0) { flash('Pick the branches that can view this email'); return }
    setSavingEmail(true)
    try {
      const payload = { departments: depts, branches: branchSel, email, description: emailDesc, visibleBranches: restrictView ? viewSel : [] }
      const res = await fetch('/api/directory', {
        method: editEmailId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editEmailId ? { id: editEmailId, ...payload } : payload),
      })
      const data = await res.json()
      if (res.ok) { flash(editEmailId ? 'Email updated' : 'Email added'); resetEmailForm(); loadEmails() }
      else flash(data.error ?? 'Failed')
    } catch { flash('Failed') }
    setSavingEmail(false)
  }
  async function removeEmail(id: string) {
    if (!confirm('Remove this email entry?')) return
    await fetch(`/api/directory?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); loadEmails()
  }

  // ── Websites ────────────────────────────────────────────────────
  const [websites, setWebsites] = useState<WebsiteEntry[]>([])
  const [showWebForm, setShowWebForm] = useState(false)
  const [editWebId, setEditWebId] = useState<string | null>(null)
  const [wLink, setWLink] = useState('')
  const [wDesc, setWDesc] = useState('')
  const [wRestrict, setWRestrict] = useState(false)
  const [wViewSel, setWViewSel] = useState<string[]>([])
  const [savingWeb, setSavingWeb] = useState(false)
  const [webQ, setWebQ] = useState('')
  const [webSort, setWebSort] = useState<SortState>({ col: '', dir: 'asc' })
  const webFormRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (showWebForm && editWebId) webFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [showWebForm, editWebId])
  async function loadWebsites() {
    const res = await fetch('/api/directory/websites')
    if (res.ok) setWebsites((await res.json()).websites ?? [])
  }
  function resetWebForm() {
    setEditWebId(null); setWLink(''); setWDesc(''); setWRestrict(false); setWViewSel([]); setShowWebForm(false)
  }
  function startEditWeb(w: WebsiteEntry) {
    setEditWebId(w.id); setWLink(w.link ?? ''); setWDesc(w.description ?? '')
    const vb = w.visibleBranches ?? []; setWRestrict(vb.length > 0); setWViewSel(vb); setShowWebForm(true)
  }
  async function saveWeb() {
    if (!wLink) { flash('A link is required'); return }
    if (wRestrict && wViewSel.length === 0) { flash('Pick the branches that can view this link'); return }
    setSavingWeb(true)
    try {
      const payload = { link: wLink, description: wDesc, visibleBranches: wRestrict ? wViewSel : [] }
      const res = await fetch('/api/directory/websites', {
        method: editWebId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editWebId ? { id: editWebId, ...payload } : payload),
      })
      const data = await res.json()
      if (res.ok) { flash(editWebId ? 'Website updated' : 'Website added'); resetWebForm(); loadWebsites() }
      else flash(data.error ?? 'Failed')
    } catch { flash('Failed') }
    setSavingWeb(false)
  }
  async function removeWeb(id: string) {
    if (!confirm('Remove this website?')) return
    await fetch(`/api/directory/websites?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); loadWebsites()
  }

  const [loading, setLoading] = useState(true)
  useEffect(() => {
    Promise.all([loadBranchInfo(), loadEmails(), loadWebsites()]).finally(() => setLoading(false))
  }, [])

  const tabs: { key: Tab; label: string; icon: typeof Building2 }[] = [
    { key: 'branch', label: 'Branch Information', icon: Building2 },
    { key: 'emails', label: 'Emails', icon: Mail },
    { key: 'websites', label: 'Websites', icon: Globe },
  ]

  function toggleSort(setter: React.Dispatch<React.SetStateAction<SortState>>, col: string) {
    setter((s) => (s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' }))
  }

  // Filter (text search) + sort the Emails rows.
  const visibleEmails = useMemo(() => {
    const q = emailQ.trim().toLowerCase()
    let rows = entries
    if (q) rows = rows.filter((e) => [
      ...(e.departments ?? []).map((d) => DEPT_LABELS[d] ?? d),
      ...(e.branches ?? []).map((b) => BRANCH_LABELS[b] ?? b),
      e.email ?? '', e.description ?? '',
    ].join(' ').toLowerCase().includes(q))
    if (emailSort.col) {
      const key = (e: DirectoryEntry) => {
        if (emailSort.col === 'dept') { const d = sortDepts(e.departments ?? [])[0]; return d ? (DEPT_LABELS[d] ?? d) : '' }
        if (emailSort.col === 'branch') { const b = sortBranches(e.branches ?? [])[0]; return b ? (BRANCH_LABELS[b] ?? b) : '' }
        if (emailSort.col === 'email') return (e.email ?? '').toLowerCase()
        return (e.description ?? '').toLowerCase()
      }
      rows = [...rows].sort((a, b) => key(a).localeCompare(key(b)) * (emailSort.dir === 'asc' ? 1 : -1))
    }
    return rows
  }, [entries, emailQ, emailSort])

  // Filter (text search) + sort the Websites rows.
  const visibleWebsites = useMemo(() => {
    const q = webQ.trim().toLowerCase()
    let rows = websites
    if (q) rows = rows.filter((w) => [w.link ?? '', w.description ?? ''].join(' ').toLowerCase().includes(q))
    if (webSort.col) {
      const key = (w: WebsiteEntry) => (webSort.col === 'link' ? (w.link ?? '') : (w.description ?? '')).toLowerCase()
      rows = [...rows].sort((a, b) => key(a).localeCompare(key(b)) * (webSort.dir === 'asc' ? 1 : -1))
    }
    return rows
  }, [websites, webQ, webSort])

  return (
    <div className={`${PAGE} !max-w-[1040px]`}>
      {toast && <div className="toast" role="status">{toast}</div>}

      <PageHeader
        eyebrow="Resources"
        title="Directory"
        description="Branch information, emails and websites across the clinic."
      />

      {/* Online Forms — scannable QR cards (HR fillable forms) */}
      <DashCard
        title="Online forms — scan or click"
        icon={<Contact size={16} />}
        description="These forms have fillable online versions. Scan the QR with your phone, or tap a card to open it."
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {FORM_QRS.map((f) => (
            <a key={f.id} href={`${HR_BASE}${f.path}`} target="_blank" rel="noopener noreferrer"
              className={`rounded-xl p-3 flex flex-col items-center text-center transition-[border-color,box-shadow] hover:border-[var(--teal)] hover:shadow-[0_6px_18px_-10px_rgba(36,73,82,0.35)] ${FOCUS}`}
              style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/forms-qr/${f.id}.svg`} alt={`${f.code} ${f.name} QR code`} width={120} height={120} className="w-full max-w-[112px]" style={{ aspectRatio: '1 / 1' }} />
              <span className="mt-2"><Tag tone="warn">{f.code}</Tag></span>
              <span className="mt-1 text-[12.5px] font-semibold leading-tight" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>{f.name}</span>
              <span className="mt-1 inline-flex items-center gap-1 text-[10.5px]" style={{ color: 'var(--teal)' }}><ExternalLink size={10} /> Open form</span>
            </a>
          ))}
        </div>
      </DashCard>

      {/* Subtabs */}
      <PillTabs
        label="Directory section"
        value={tab}
        onChange={(id) => setTab(id as Tab)}
        tabs={tabs.map((t) => ({
          id: t.key,
          label: <span className="inline-flex items-center gap-1.5"><t.icon size={13} /> {t.label}</span>,
          count: t.key === 'emails' ? entries.length : t.key === 'websites' ? websites.length : undefined,
        }))}
      />

      {loading ? (
        <div className="space-y-3" role="status" aria-label="Loading directory">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : (
        <>
          {/* ── BRANCH INFORMATION ── */}
          {tab === 'branch' && (
            <div className="space-y-4">
              {BRANCH_ORDER.map((b) => (
                <section key={b} className="rounded-xl" style={CARD_STYLE}>
                  <header className="px-4 sm:px-5 pt-4 pb-3 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--light-gray)' }}>
                    <h2 className="flex items-center gap-2 text-[14px] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                      <Building2 size={16} style={{ color: 'var(--teal)' }} />
                      {BRANCH_LABELS[b]}
                    </h2>
                    {isAdmin && (
                      <button type="button" onClick={() => saveBranch(b)} disabled={savingBranch === b} className={BTN_SM} style={{ ...SECONDARY_STYLE, color: 'var(--deep-teal)' }}>
                        {savingBranch === b ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
                      </button>
                    )}
                  </header>
                  <div className="p-4 sm:p-5">
                    {isAdmin ? (
                      <textarea value={branchDraft[b] ?? ''} onChange={(e) => setBranchDraft((p) => ({ ...p, [b]: e.target.value }))}
                        rows={5} placeholder={`Information for ${BRANCH_LABELS[b]} branch…`} aria-label={`${BRANCH_LABELS[b]} branch information`}
                        className={`${TEXTAREA} resize-y`} style={{ ...CONTROL_STYLE, minHeight: 90 }} />
                    ) : (
                      <p className="text-[13.5px] whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--charcoal)' }}>
                        {(branchInfo.find((x) => x.branch === b)?.info || '').trim() || <span className="italic" style={{ color: 'var(--mid-gray)' }}>No information yet.</span>}
                      </p>
                    )}
                  </div>
                  {BRANCH_CONTACTS[b] && (
                    <div className="px-4 sm:px-5 py-3 flex flex-wrap items-center gap-2 rounded-b-xl" style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
                      <span className="text-[11px] font-semibold uppercase tracking-wider mr-1" style={{ color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>Chat with this branch</span>
                      <a href={BRANCH_CONTACTS[b].messenger} target="_blank" rel="noopener noreferrer"
                        className={`${BTN_SM} text-white`} style={{ background: '#0084FF' }}>
                        <MessageCircle size={13} /> Messenger
                      </a>
                      <a href={`viber://chat?number=${encodeURIComponent(BRANCH_CONTACTS[b].viberNumber)}`}
                        className={`${BTN_SM} text-white`} style={{ background: '#7360F2' }}>
                        <Phone size={13} /> Viber
                      </a>
                      <span className="text-[12px] tabular-nums" style={{ color: 'var(--mid-gray)' }}>{BRANCH_CONTACTS[b].viberDisplay}</span>
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}

          {/* ── EMAILS ── */}
          {tab === 'emails' && (
            <div>
              {isAdmin && (
                <div className="mb-4">
                  {!showEmailForm ? (
                    <button type="button" onClick={() => { resetEmailForm(); setShowEmailForm(true) }} className={BTN_PRIMARY} style={PRIMARY_STYLE}>
                      <Plus size={15} /> Add Email
                    </button>
                  ) : (
                    <div ref={emailFormRef} className="rounded-xl p-4 sm:p-5" style={CARD_STYLE}>
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="font-bold text-[15px]" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>{editEmailId ? 'Edit Email' : 'New Email'}</h2>
                        <button type="button" onClick={resetEmailForm} className={`w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--off-white)] ${FOCUS}`} style={{ color: 'var(--mid-gray)' }} aria-label="Close form"><X size={17} /></button>
                      </div>
                      <label className={`${LABEL} !mb-2`} style={LABEL_STYLE}>Department(s)</label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                        {DEPT_ORDER.map((d) => {
                          const on = depts.includes(d)
                          return (
                            <button key={d} type="button" onClick={() => setDepts((p) => p.includes(d) ? p.filter((x) => x !== d) : [...p, d])}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-[13px] transition-colors"
                              style={on ? { background: 'var(--sage-tint)', borderColor: 'var(--moss)', color: 'var(--deep-teal)' } : { background: '#fff', borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                              <span className="w-4 h-4 rounded flex items-center justify-center shrink-0 text-white text-[11px] font-bold" style={{ background: on ? 'var(--moss)' : 'transparent', border: on ? 'none' : '1.5px solid var(--light-gray)' }}>{on ? '✓' : ''}</span>
                              {DEPT_LABELS[d] ?? d}
                            </button>
                          )
                        })}
                      </div>
                      <label className={`${LABEL} !mb-2`} style={LABEL_STYLE}>Branch(es)</label>
                      <div className="mb-4"><BranchPicker selected={branchSel} onToggle={(b) => setBranchSel((p) => p.includes(b) ? p.filter((x) => x !== b) : [...p, b])} accent="gold" /></div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                        <div>
                          <label className={LABEL} style={LABEL_STYLE}>Email</label>
                          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@sapphireclinicseast.org" className={`${CONTROL} w-full`} style={CONTROL_STYLE} />
                        </div>
                        <div>
                          <label className={LABEL} style={LABEL_STYLE}>Description</label>
                          <input value={emailDesc} onChange={(e) => setEmailDesc(e.target.value)} placeholder="e.g. OT booking & inquiries" className={`${CONTROL} w-full`} style={CONTROL_STYLE} />
                        </div>
                      </div>
                      <label className={`${LABEL} !mb-2`} style={LABEL_STYLE}>Who can view this email?</label>
                      <div className="flex flex-col gap-2 mb-4">
                        <label className="flex items-center gap-2 text-[13px] cursor-pointer text-[var(--charcoal)]"><input type="radio" checked={!restrictView} onChange={() => { setRestrictView(false); setViewSel([]) }} /> Everyone</label>
                        <label className="flex items-center gap-2 text-[13px] cursor-pointer text-[var(--charcoal)]"><input type="radio" checked={restrictView} onChange={() => setRestrictView(true)} /> Only staff from specific branches</label>
                        {restrictView && <div className="sm:pl-6"><BranchPicker selected={viewSel} onToggle={(b) => setViewSel((p) => p.includes(b) ? p.filter((x) => x !== b) : [...p, b])} /></div>}
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={saveEmail} disabled={savingEmail} className={BTN_PRIMARY} style={PRIMARY_STYLE}>
                          {savingEmail ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {editEmailId ? 'Save Changes' : 'Add Email'}
                        </button>
                        <button type="button" onClick={resetEmailForm} className={BTN_SECONDARY} style={SECONDARY_STYLE}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {entries.length > 0 && (
                <div className="relative mb-3 sm:max-w-xs">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
                  <input value={emailQ} onChange={(e) => setEmailQ(e.target.value)} placeholder="Filter emails…" className={`${CONTROL} w-full pl-9`} style={CONTROL_STYLE} />
                </div>
              )}
              <div className="rounded-xl overflow-hidden" style={CARD_STYLE}>
                {entries.length === 0 ? (
                  <EmptyState icon="file" title="No emails yet." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px] text-left border-collapse">
                      <thead>
                        <tr>
                          <SortableTh label="Department" col="dept" sort={emailSort} onToggle={(c) => toggleSort(setEmailSort, c)} />
                          <SortableTh label="Branch" col="branch" sort={emailSort} onToggle={(c) => toggleSort(setEmailSort, c)} />
                          <SortableTh label="Email" col="email" sort={emailSort} onToggle={(c) => toggleSort(setEmailSort, c)} />
                          <SortableTh label="Description" col="desc" sort={emailSort} onToggle={(c) => toggleSort(setEmailSort, c)} />
                          {isAdmin && <th scope="col" className={`${TH} !px-5`} style={TH_STYLE}>Visible To</th>}
                          {isAdmin && <th scope="col" className={`${TH} !px-5 w-24`} style={TH_STYLE}><span className="sr-only">Actions</span></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleEmails.length === 0 && (
                          <tr><td colSpan={isAdmin ? 6 : 4} className="px-5 py-10 text-center text-[13px] text-[var(--mid-gray)]">No emails match “{emailQ}”.</td></tr>
                        )}
                        {visibleEmails.map((e) => (
                          <tr key={e.id} className="align-top transition-colors hover:bg-[#F8FAF2]" style={{ borderTop: '1px solid var(--light-gray)' }}>
                            <td className="px-5 py-3"><div className="flex flex-wrap gap-1.5">{sortDepts(e.departments).map((d) => <Tag key={d} tone="brand">{DEPT_LABELS[d] ?? d}</Tag>)}</div></td>
                            <td className="px-5 py-3"><div className="flex flex-wrap gap-1.5">{sortBranches(e.branches ?? []).map((b) => <Tag key={b} tone="warn">{BRANCH_LABELS[b] ?? b}</Tag>)}</div></td>
                            <td className="px-5 py-3">
                              {e.emailHidden ? (
                                <span className="text-[13px] text-[var(--mid-gray)] inline-flex items-center gap-1.5"><Lock size={13} /> Restricted</span>
                              ) : (
                                <a href={`mailto:${e.email}`} className="text-[13px] font-medium text-[var(--teal)] hover:underline inline-flex items-center gap-1.5"><Mail size={13} className="shrink-0" />{e.email}</a>
                              )}
                            </td>
                            <td className="px-5 py-3 text-[13px] text-[var(--charcoal)]">{e.description || <span className="text-[var(--mid-gray)]">—</span>}</td>
                            {isAdmin && <td className="px-5 py-3"><VisibleTo visibleBranches={e.visibleBranches} /></td>}
                            {isAdmin && (
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-1">
                                  <button type="button" onClick={() => startEditEmail(e)} className={`w-8 h-8 rounded-md flex items-center justify-center hover:bg-[var(--pale-teal)] ${FOCUS}`} style={{ color: 'var(--teal)' }} title="Edit" aria-label={`Edit ${e.email ?? 'email'}`}><Pencil size={14} /></button>
                                  <button type="button" onClick={() => removeEmail(e.id)} className={`${BTN_DANGER_GHOST} !w-8 !px-0`} style={{ color: DANGER }} title="Remove" aria-label={`Remove ${e.email ?? 'email'}`}><Trash2 size={14} /></button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── WEBSITES ── */}
          {tab === 'websites' && (
            <div>
              {isAdmin && (
                <div className="mb-4">
                  {!showWebForm ? (
                    <button type="button" onClick={() => { resetWebForm(); setShowWebForm(true) }} className={BTN_PRIMARY} style={PRIMARY_STYLE}>
                      <Plus size={15} /> Add Website
                    </button>
                  ) : (
                    <div ref={webFormRef} className="rounded-xl p-4 sm:p-5" style={CARD_STYLE}>
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="font-bold text-[15px]" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>{editWebId ? 'Edit Website' : 'New Website'}</h2>
                        <button type="button" onClick={resetWebForm} className={`w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--off-white)] ${FOCUS}`} style={{ color: 'var(--mid-gray)' }} aria-label="Close form"><X size={17} /></button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                        <div>
                          <label className={LABEL} style={LABEL_STYLE}>Link</label>
                          <input value={wLink} onChange={(e) => setWLink(e.target.value)} placeholder="https://example.com" className={`${CONTROL} w-full`} style={CONTROL_STYLE} />
                        </div>
                        <div>
                          <label className={LABEL} style={LABEL_STYLE}>Description</label>
                          <input value={wDesc} onChange={(e) => setWDesc(e.target.value)} placeholder="e.g. PhilHealth portal" className={`${CONTROL} w-full`} style={CONTROL_STYLE} />
                        </div>
                      </div>
                      <label className={`${LABEL} !mb-2`} style={LABEL_STYLE}>Who can view this link?</label>
                      <div className="flex flex-col gap-2 mb-4">
                        <label className="flex items-center gap-2 text-[13px] cursor-pointer text-[var(--charcoal)]"><input type="radio" checked={!wRestrict} onChange={() => { setWRestrict(false); setWViewSel([]) }} /> Everyone</label>
                        <label className="flex items-center gap-2 text-[13px] cursor-pointer text-[var(--charcoal)]"><input type="radio" checked={wRestrict} onChange={() => setWRestrict(true)} /> Only staff from specific branches</label>
                        {wRestrict && <div className="sm:pl-6"><BranchPicker selected={wViewSel} onToggle={(b) => setWViewSel((p) => p.includes(b) ? p.filter((x) => x !== b) : [...p, b])} /></div>}
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={saveWeb} disabled={savingWeb} className={BTN_PRIMARY} style={PRIMARY_STYLE}>
                          {savingWeb ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {editWebId ? 'Save Changes' : 'Add Website'}
                        </button>
                        <button type="button" onClick={resetWebForm} className={BTN_SECONDARY} style={SECONDARY_STYLE}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {websites.length > 0 && (
                <div className="relative mb-3 sm:max-w-xs">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
                  <input value={webQ} onChange={(e) => setWebQ(e.target.value)} placeholder="Filter websites…" className={`${CONTROL} w-full pl-9`} style={CONTROL_STYLE} />
                </div>
              )}
              <div className="rounded-xl overflow-hidden" style={CARD_STYLE}>
                {websites.length === 0 ? (
                  <EmptyState icon="external" title="No websites yet." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px] text-left border-collapse">
                      <thead>
                        <tr>
                          <SortableTh label="Link" col="link" sort={webSort} onToggle={(c) => toggleSort(setWebSort, c)} />
                          <SortableTh label="Description" col="desc" sort={webSort} onToggle={(c) => toggleSort(setWebSort, c)} />
                          {isAdmin && <th scope="col" className={`${TH} !px-5`} style={TH_STYLE}>Visible To</th>}
                          {isAdmin && <th scope="col" className={`${TH} !px-5 w-24`} style={TH_STYLE}><span className="sr-only">Actions</span></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleWebsites.length === 0 && (
                          <tr><td colSpan={isAdmin ? 4 : 2} className="px-5 py-10 text-center text-[13px] text-[var(--mid-gray)]">No websites match “{webQ}”.</td></tr>
                        )}
                        {visibleWebsites.map((w) => (
                          <tr key={w.id} className="align-top transition-colors hover:bg-[#F8FAF2]" style={{ borderTop: '1px solid var(--light-gray)' }}>
                            <td className="px-5 py-3">
                              {w.linkHidden ? (
                                <span className="text-[13px] text-[var(--mid-gray)] inline-flex items-center gap-1.5"><Lock size={13} /> Restricted</span>
                              ) : (
                                <a href={w.link ?? '#'} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium text-[var(--teal)] hover:underline inline-flex items-center gap-1.5 break-all"><ExternalLink size={13} className="shrink-0" />{w.link}</a>
                              )}
                            </td>
                            <td className="px-5 py-3 text-[13px] text-[var(--charcoal)]">{w.description || <span className="text-[var(--mid-gray)]">—</span>}</td>
                            {isAdmin && <td className="px-5 py-3"><VisibleTo visibleBranches={w.visibleBranches} /></td>}
                            {isAdmin && (
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-1">
                                  <button type="button" onClick={() => startEditWeb(w)} className={`w-8 h-8 rounded-md flex items-center justify-center hover:bg-[var(--pale-teal)] ${FOCUS}`} style={{ color: 'var(--teal)' }} title="Edit" aria-label={`Edit ${w.link ?? 'website'}`}><Pencil size={14} /></button>
                                  <button type="button" onClick={() => removeWeb(w.id)} className={`${BTN_DANGER_GHOST} !w-8 !px-0`} style={{ color: DANGER }} title="Remove" aria-label={`Remove ${w.link ?? 'website'}`}><Trash2 size={14} /></button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
