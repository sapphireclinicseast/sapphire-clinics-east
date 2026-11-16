'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import {
  Tag,
  BTN_PRIMARY, BTN_SECONDARY, CONTROL, CONTROL_STYLE, DANGER, FOCUS,
  LABEL, LABEL_STYLE, PAGE, PRIMARY_STYLE, SECONDARY_STYLE, TEXTAREA,
} from '@/components/hub/ui'
import { Contact, Plus, Trash2, Loader2, X, Mail, Lock, Pencil, Globe, Building2, Save, ExternalLink, Search, ChevronUp, ChevronDown, ChevronsUpDown, MessageCircle, Phone, Copy, Check } from 'lucide-react'

/* Accounting Hub list look (see accounting-hub official-documents). */
const C = {
  line: '#DDE6CC', rowLine: '#E9EFDC', head: '#f8faf6', bar: '#fcfdfa',
  text: '#233038', muted: '#55616A', faint: '#8A9AA0', teal: '#4A8073', deep: '#3C6A5F', pale: '#EDF3D9',
}
const TH = 'text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-[.4px] whitespace-nowrap'
const ICON_BTN = 'w-7 h-7 inline-flex items-center justify-center rounded-lg transition-colors'

type SortState = { col: string; dir: 'asc' | 'desc' }

// Clickable column header that toggles asc → desc → asc on the given column.
function SortableTh({ label, col, sort, onToggle, className }: { label: string; col: string; sort: SortState; onToggle: (c: string) => void; className?: string }) {
  const active = sort.col === col
  return (
    <th scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`${TH} ${className ?? ''}`} style={active ? { color: C.deep } : undefined}>
      <button type="button" onClick={() => onToggle(col)} className={`inline-flex items-center gap-1 uppercase tracking-[.4px] rounded hover:text-[#3C6A5F] ${FOCUS}`}>
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
  if (list.length === 0) return <span className="text-[12px]" style={{ color: C.muted }}>Everyone</span>
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
  const [copied, setCopied] = useState<string | null>(null)
  async function copyEmail(id: string, value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(id); setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500) }
    catch { flash('Could not copy') }
  }

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

  const emailForm = showEmailForm && (
    <div ref={emailFormRef} className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: C.line, boxShadow: `inset 4px 0 0 ${C.teal}` }}>
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b" style={{ borderColor: C.line, background: C.bar }}>
        <h2 className="text-[15px] font-bold" style={{ fontFamily: 'var(--font-display)', color: C.text }}>{editEmailId ? 'Edit email' : 'Add email'}</h2>
        <button type="button" onClick={resetEmailForm} aria-label="Close form" className={`p-1 rounded-md hover:bg-[#EDF3D9] ${FOCUS}`}><X size={16} style={{ color: C.muted }} /></button>
      </div>
      <div className="p-5">
        <label className={`${LABEL} !mb-2`} style={LABEL_STYLE}>Department(s)</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
          {DEPT_ORDER.map((d) => {
            const on = depts.includes(d)
            return (
              <button key={d} type="button" onClick={() => setDepts((p) => p.includes(d) ? p.filter((x) => x !== d) : [...p, d])}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-[13px] transition-colors"
                style={on ? { background: 'var(--sage-tint)', borderColor: 'var(--moss)', color: 'var(--deep-teal)' } : { background: '#fff', borderColor: C.line, color: C.text }}>
                <span className="w-4 h-4 rounded flex items-center justify-center shrink-0 text-white text-[11px] font-bold" style={{ background: on ? 'var(--moss)' : 'transparent', border: on ? 'none' : `1.5px solid ${C.line}` }}>{on ? '✓' : ''}</span>
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
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-[13px] cursor-pointer" style={{ color: C.text }}><input type="radio" checked={!restrictView} onChange={() => { setRestrictView(false); setViewSel([]) }} /> Everyone</label>
          <label className="flex items-center gap-2 text-[13px] cursor-pointer" style={{ color: C.text }}><input type="radio" checked={restrictView} onChange={() => setRestrictView(true)} /> Only staff from specific branches</label>
          {restrictView && <div className="sm:pl-6"><BranchPicker selected={viewSel} onToggle={(b) => setViewSel((p) => p.includes(b) ? p.filter((x) => x !== b) : [...p, b])} /></div>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 px-5 py-3 border-t" style={{ borderColor: C.line, background: C.bar }}>
        <button type="button" onClick={saveEmail} disabled={savingEmail} className={BTN_PRIMARY} style={PRIMARY_STYLE}>
          {savingEmail ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {editEmailId ? 'Save changes' : 'Add email'}
        </button>
        <button type="button" onClick={resetEmailForm} className={BTN_SECONDARY} style={SECONDARY_STYLE}>Cancel</button>
      </div>
    </div>
  )

  const webForm = showWebForm && (
    <div ref={webFormRef} className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: C.line, boxShadow: `inset 4px 0 0 ${C.teal}` }}>
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b" style={{ borderColor: C.line, background: C.bar }}>
        <h2 className="text-[15px] font-bold" style={{ fontFamily: 'var(--font-display)', color: C.text }}>{editWebId ? 'Edit website' : 'Add website'}</h2>
        <button type="button" onClick={resetWebForm} aria-label="Close form" className={`p-1 rounded-md hover:bg-[#EDF3D9] ${FOCUS}`}><X size={16} style={{ color: C.muted }} /></button>
      </div>
      <div className="p-5">
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
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-[13px] cursor-pointer" style={{ color: C.text }}><input type="radio" checked={!wRestrict} onChange={() => { setWRestrict(false); setWViewSel([]) }} /> Everyone</label>
          <label className="flex items-center gap-2 text-[13px] cursor-pointer" style={{ color: C.text }}><input type="radio" checked={wRestrict} onChange={() => setWRestrict(true)} /> Only staff from specific branches</label>
          {wRestrict && <div className="sm:pl-6"><BranchPicker selected={wViewSel} onToggle={(b) => setWViewSel((p) => p.includes(b) ? p.filter((x) => x !== b) : [...p, b])} /></div>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 px-5 py-3 border-t" style={{ borderColor: C.line, background: C.bar }}>
        <button type="button" onClick={saveWeb} disabled={savingWeb} className={BTN_PRIMARY} style={PRIMARY_STYLE}>
          {savingWeb ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {editWebId ? 'Save changes' : 'Add website'}
        </button>
        <button type="button" onClick={resetWebForm} className={BTN_SECONDARY} style={SECONDARY_STYLE}>Cancel</button>
      </div>
    </div>
  )

  /* Toolbar row inside a table card: search on the left, count, Add on the right. */
  const toolbar = (q: string, setQ: (v: string) => void, placeholder: string, shown: number, total: number, onAdd: (() => void) | null, addLabel: string) => (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b" style={{ background: C.bar, borderColor: C.line }}>
      <div className="relative flex-1 min-w-[200px] max-w-md">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: C.faint }} aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder}
          className="w-full h-8 pl-8 pr-3 rounded-lg border text-xs bg-white focus:outline-none focus:border-[#4A8073]" style={{ borderColor: C.line, color: C.text }} />
      </div>
      <span className="text-xs" style={{ color: C.muted }}>{q.trim() ? `${shown} of ${total} shown` : `${total} total`}</span>
      {onAdd && (
        <button type="button" onClick={onAdd} className={`ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 ${FOCUS}`} style={{ background: C.teal }}>
          <Plus size={14} aria-hidden /> {addLabel}
        </button>
      )}
    </div>
  )

  return (
    <div className={`${PAGE} !max-w-[1100px]`}>
      {toast && <div className="toast" role="status">{toast}</div>}

      {/* Header — Accounting Hub style */}
      <div className="min-w-0">
        <h1 className="text-2xl font-bold leading-tight flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: C.text }}>
          <Contact size={22} style={{ color: C.teal }} aria-hidden /> Directory
        </h1>
        <p className="mt-1 text-[13px] max-w-3xl" style={{ color: C.muted }}>Branch information, emails, websites and the online HR forms.</p>
      </div>

      {/* Online forms — compact QR cards */}
      <div className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: C.line }}>
        <div className="px-4 py-2.5 border-b flex flex-wrap items-baseline gap-x-3 gap-y-0.5" style={{ background: C.bar, borderColor: C.line }}>
          <h2 className="text-[13px] font-bold" style={{ fontFamily: 'var(--font-display)', color: C.text }}>Online forms</h2>
          <p className="text-xs" style={{ color: C.muted }}>Scan the QR with your phone, or click to open.</p>
        </div>
        <div className="p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {FORM_QRS.map((f) => (
            <a key={f.id} href={`${HR_BASE}${f.path}`} target="_blank" rel="noopener noreferrer"
              className={`rounded-lg border p-2.5 flex flex-col items-center text-center transition-colors hover:border-[#4A8073] hover:bg-[#fafcf6] ${FOCUS}`}
              style={{ borderColor: C.line, background: '#fff' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/forms-qr/${f.id}.svg`} alt={`${f.code} ${f.name} QR code`} width={96} height={96} className="w-full max-w-[96px]" style={{ aspectRatio: '1 / 1' }} />
              <span className="mt-1.5 font-mono text-[10.5px] font-bold" style={{ color: '#B7791F' }}>{f.code}</span>
              <span className="text-[12px] font-semibold leading-tight" style={{ color: C.text }}>{f.name}</span>
            </a>
          ))}
        </div>
      </div>

      {/* Tabs — underline style with counts */}
      <div className="border-b-2" style={{ borderColor: C.line }}>
        <div className="flex items-end gap-1 -mb-[2px] max-w-full overflow-x-auto" role="tablist" aria-label="Directory section">
          {tabs.map((t) => {
            const on = tab === t.key
            const n = t.key === 'emails' ? entries.length : t.key === 'websites' ? websites.length : null
            return (
              <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => setTab(t.key)}
                className={`px-3.5 py-2.5 text-[13px] font-semibold border-b-2 whitespace-nowrap transition-colors hover:text-[#4A8073] flex items-center gap-1.5 ${FOCUS}`}
                style={{ fontFamily: 'var(--font-display)', borderColor: on ? C.teal : 'transparent', color: on ? C.teal : C.muted }}>
                <t.icon size={13} aria-hidden /> {t.label}
                {!loading && n !== null && !!n && <span className="px-1.5 rounded-full text-[11px] font-bold" style={{ background: on ? C.pale : '#f1f5f2', color: on ? C.deep : C.muted }}>{n}</span>}
              </button>
            )
          })}
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border bg-white p-4 space-y-2" style={{ borderColor: C.line }} role="status" aria-label="Loading directory">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-7 rounded animate-pulse" style={{ background: '#f1f4ec' }} />)}
        </div>
      ) : (
        <>
          {/* ── BRANCH INFORMATION ── */}
          {tab === 'branch' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {BRANCH_ORDER.map((b) => (
                <section key={b} className="rounded-lg border bg-white overflow-hidden flex flex-col" style={{ borderColor: C.line, boxShadow: `inset 4px 0 0 ${C.teal}` }}>
                  <header className="px-4 py-2.5 flex items-center justify-between gap-3 border-b" style={{ borderColor: C.line, background: C.bar }}>
                    <h2 className="flex items-center gap-2 text-[13.5px] font-bold" style={{ fontFamily: 'var(--font-display)', color: C.text }}>
                      <Building2 size={15} style={{ color: C.teal }} aria-hidden /> {BRANCH_LABELS[b]}
                    </h2>
                    {isAdmin && (
                      <button type="button" onClick={() => saveBranch(b)} disabled={savingBranch === b}
                        className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border bg-white text-[11.5px] font-semibold transition-colors hover:bg-[#EDF3D9] disabled:opacity-50 ${FOCUS}`} style={{ borderColor: C.line, color: C.deep }}>
                        {savingBranch === b ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
                      </button>
                    )}
                  </header>
                  <div className="p-4 flex-1">
                    {isAdmin ? (
                      <textarea value={branchDraft[b] ?? ''} onChange={(e) => setBranchDraft((p) => ({ ...p, [b]: e.target.value }))}
                        rows={5} placeholder={`Information for ${BRANCH_LABELS[b]} branch…`} aria-label={`${BRANCH_LABELS[b]} branch information`}
                        className={`${TEXTAREA} resize-y`} style={{ ...CONTROL_STYLE, minHeight: 90 }} />
                    ) : (
                      <p className="text-[13px] whitespace-pre-wrap leading-relaxed" style={{ color: C.text }}>
                        {(branchInfo.find((x) => x.branch === b)?.info || '').trim() || <span className="italic" style={{ color: C.muted }}>No information yet.</span>}
                      </p>
                    )}
                  </div>
                  {BRANCH_CONTACTS[b] && (
                    <div className="px-4 py-2.5 flex flex-wrap items-center gap-2 border-t" style={{ borderColor: C.line, background: C.bar }}>
                      <span className="text-[11px] font-bold uppercase tracking-[.4px] mr-1" style={{ color: C.muted }}>Chat</span>
                      <a href={BRANCH_CONTACTS[b].messenger} target="_blank" rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11.5px] font-semibold text-white ${FOCUS}`} style={{ background: '#0084FF' }}>
                        <MessageCircle size={12} aria-hidden /> Messenger
                      </a>
                      <a href={`viber://chat?number=${encodeURIComponent(BRANCH_CONTACTS[b].viberNumber)}`}
                        className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11.5px] font-semibold text-white ${FOCUS}`} style={{ background: '#7360F2' }}>
                        <Phone size={12} aria-hidden /> Viber
                      </a>
                      <span className="text-xs font-mono" style={{ color: C.muted }}>{BRANCH_CONTACTS[b].viberDisplay}</span>
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}

          {/* ── EMAILS ── */}
          {tab === 'emails' && (
            <div className="space-y-3">
              {emailForm}
              <div className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: C.line }}>
                {toolbar(emailQ, setEmailQ, 'Search department, branch, email…', visibleEmails.length, entries.length,
                  isAdmin && !showEmailForm ? () => { resetEmailForm(); setShowEmailForm(true) } : null, 'Add email')}
                {entries.length === 0 ? (
                  <p className="px-6 py-12 text-[13px] text-center" style={{ color: C.muted }}>No emails yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-xs">
                      <thead>
                        <tr style={{ background: C.head, color: C.muted }}>
                          <SortableTh label="Department" col="dept" sort={emailSort} onToggle={(c) => toggleSort(setEmailSort, c)} />
                          <SortableTh label="Branch" col="branch" sort={emailSort} onToggle={(c) => toggleSort(setEmailSort, c)} />
                          <SortableTh label="Email" col="email" sort={emailSort} onToggle={(c) => toggleSort(setEmailSort, c)} />
                          <SortableTh label="Description" col="desc" sort={emailSort} onToggle={(c) => toggleSort(setEmailSort, c)} />
                          {isAdmin && <th scope="col" className={TH}>Visible to</th>}
                          {isAdmin && <th scope="col" className={`${TH} w-20`}><span className="sr-only">Actions</span></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleEmails.length === 0 && (
                          <tr><td colSpan={isAdmin ? 6 : 4} className="px-6 py-10 text-center text-[13px]" style={{ color: C.muted }}>No emails match “{emailQ}”.</td></tr>
                        )}
                        {visibleEmails.map((e) => (
                          <tr key={e.id} className="border-t align-top transition-colors hover:bg-[#fafcf6]" style={{ borderColor: C.rowLine }}>
                            <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1">{sortDepts(e.departments).map((d) => <Tag key={d} tone="brand">{DEPT_LABELS[d] ?? d}</Tag>)}</div></td>
                            <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1">{sortBranches(e.branches ?? []).map((b) => (
                              <span key={b} className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: C.pale, color: C.deep }}>{BRANCH_LABELS[b] ?? b}</span>
                            ))}</div></td>
                            <td className="px-3 py-2.5">
                              {e.emailHidden ? (
                                <span className="inline-flex items-center gap-1.5" style={{ color: C.muted }}><Lock size={12} aria-hidden /> Restricted</span>
                              ) : (
                                <span className="inline-flex items-center gap-1">
                                  <a href={`mailto:${e.email}`} className="font-medium hover:underline underline-offset-2 inline-flex items-center gap-1.5" style={{ color: C.teal }}><Mail size={12} className="shrink-0" aria-hidden />{e.email}</a>
                                  {e.email && (
                                    <button type="button" onClick={() => copyEmail(e.id, e.email as string)} className={`${ICON_BTN} hover:bg-[#EDF3D9] ${FOCUS}`}
                                      style={{ color: copied === e.id ? C.teal : C.faint }} title={copied === e.id ? 'Copied' : 'Copy email'} aria-label={`Copy ${e.email}`}>
                                      {copied === e.id ? <Check size={12} /> : <Copy size={12} />}
                                    </button>
                                  )}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5" style={{ color: C.text }}>{e.description || <span style={{ color: C.faint }}>—</span>}</td>
                            {isAdmin && <td className="px-3 py-2.5"><VisibleTo visibleBranches={e.visibleBranches} /></td>}
                            {isAdmin && (
                              <td className="px-3 py-2.5">
                                <div className="flex justify-end gap-1">
                                  <button type="button" onClick={() => startEditEmail(e)} className={`${ICON_BTN} hover:bg-[#EDF3D9] ${FOCUS}`} style={{ color: C.teal }} title="Edit" aria-label={`Edit ${e.email ?? 'email'}`}><Pencil size={13} /></button>
                                  <button type="button" onClick={() => removeEmail(e.id)} className={`${ICON_BTN} hover:bg-red-50 ${FOCUS}`} style={{ color: DANGER }} title="Remove" aria-label={`Remove ${e.email ?? 'email'}`}><Trash2 size={13} /></button>
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
            <div className="space-y-3">
              {webForm}
              <div className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: C.line }}>
                {toolbar(webQ, setWebQ, 'Search link or description…', visibleWebsites.length, websites.length,
                  isAdmin && !showWebForm ? () => { resetWebForm(); setShowWebForm(true) } : null, 'Add website')}
                {websites.length === 0 ? (
                  <p className="px-6 py-12 text-[13px] text-center" style={{ color: C.muted }}>No websites yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px] text-xs">
                      <thead>
                        <tr style={{ background: C.head, color: C.muted }}>
                          <SortableTh label="Link" col="link" sort={webSort} onToggle={(c) => toggleSort(setWebSort, c)} />
                          <SortableTh label="Description" col="desc" sort={webSort} onToggle={(c) => toggleSort(setWebSort, c)} />
                          {isAdmin && <th scope="col" className={TH}>Visible to</th>}
                          {isAdmin && <th scope="col" className={`${TH} w-20`}><span className="sr-only">Actions</span></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleWebsites.length === 0 && (
                          <tr><td colSpan={isAdmin ? 4 : 2} className="px-6 py-10 text-center text-[13px]" style={{ color: C.muted }}>No websites match “{webQ}”.</td></tr>
                        )}
                        {visibleWebsites.map((w) => (
                          <tr key={w.id} className="border-t align-top transition-colors hover:bg-[#fafcf6]" style={{ borderColor: C.rowLine }}>
                            <td className="px-3 py-2.5">
                              {w.linkHidden ? (
                                <span className="inline-flex items-center gap-1.5" style={{ color: C.muted }}><Lock size={12} aria-hidden /> Restricted</span>
                              ) : (
                                <a href={w.link ?? '#'} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline underline-offset-2 inline-flex items-center gap-1.5 break-all" style={{ color: C.teal }}><ExternalLink size={12} className="shrink-0" aria-hidden />{w.link}</a>
                              )}
                            </td>
                            <td className="px-3 py-2.5" style={{ color: C.text }}>{w.description || <span style={{ color: C.faint }}>—</span>}</td>
                            {isAdmin && <td className="px-3 py-2.5"><VisibleTo visibleBranches={w.visibleBranches} /></td>}
                            {isAdmin && (
                              <td className="px-3 py-2.5">
                                <div className="flex justify-end gap-1">
                                  <button type="button" onClick={() => startEditWeb(w)} className={`${ICON_BTN} hover:bg-[#EDF3D9] ${FOCUS}`} style={{ color: C.teal }} title="Edit" aria-label={`Edit ${w.link ?? 'website'}`}><Pencil size={13} /></button>
                                  <button type="button" onClick={() => removeWeb(w.id)} className={`${ICON_BTN} hover:bg-red-50 ${FOCUS}`} style={{ color: DANGER }} title="Remove" aria-label={`Remove ${w.link ?? 'website'}`}><Trash2 size={13} /></button>
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
