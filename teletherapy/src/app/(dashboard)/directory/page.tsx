'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Contact, Plus, Trash2, Loader2, X, Mail, Lock, Pencil, Globe, Building2, Save, ExternalLink, Search, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

type SortState = { col: string; dir: 'asc' | 'desc' }

// Clickable column header that toggles asc → desc → asc on the given column.
function SortableTh({ label, col, sort, onToggle, className }: { label: string; col: string; sort: SortState; onToggle: (c: string) => void; className?: string }) {
  const active = sort.col === col
  return (
    <th onClick={() => onToggle(col)}
      className={`px-5 py-3 font-semibold cursor-pointer select-none hover:text-[var(--deep-teal)] transition-colors ${className ?? ''}`}>
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (sort.dir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : <ChevronsUpDown size={13} className="opacity-30" />}
      </span>
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
const BRANCH_ORDER = ['EAST', 'GREENHILLS', 'VERDANA', 'CORPORATE']

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
        <span key={b} className="px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider"
          style={{ background: 'var(--sage-tint)', color: 'var(--deep-teal)' }}>{BRANCH_LABELS[b] ?? b}</span>
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
    <div className="max-w-5xl mx-auto">
      {toast && <div className="toast">{toast}</div>}

      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--narra), var(--moss))' }}>
          <Contact size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--charcoal)]" style={{ fontFamily: 'var(--font-display)' }}>Directory</h1>
          <p className="text-[13px] text-[var(--mid-gray)] mt-0.5">Branch information, emails and websites across the clinic.</p>
        </div>
      </div>

      {/* Subtabs */}
      <div className="flex gap-1 mb-5 border-b border-[var(--light-gray)]">
        {tabs.map((t) => {
          const active = tab === t.key
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold border-b-2 -mb-px transition-colors"
              style={active
                ? { borderColor: 'var(--moss)', color: 'var(--deep-teal)' }
                : { borderColor: 'transparent', color: 'var(--mid-gray)' }}>
              <t.icon size={15} /> {t.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="py-16 text-center text-[var(--mid-gray)]"><Loader2 size={20} className="animate-spin mx-auto" /></div>
      ) : (
        <>
          {/* ── BRANCH INFORMATION ── */}
          {tab === 'branch' && (
            <div className="space-y-4">
              {BRANCH_ORDER.map((b) => (
                <div key={b} className="card-static">
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider" style={{ background: 'var(--sun-tint)', color: '#8a6a1f' }}>{BRANCH_LABELS[b]}</span>
                    {isAdmin && (
                      <button onClick={() => saveBranch(b)} disabled={savingBranch === b}
                        className="btn-primary !py-1.5 !px-3 !text-[12px] !rounded-lg">
                        {savingBranch === b ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
                      </button>
                    )}
                  </div>
                  {isAdmin ? (
                    <textarea value={branchDraft[b] ?? ''} onChange={(e) => setBranchDraft((p) => ({ ...p, [b]: e.target.value }))}
                      rows={5} placeholder={`Information for ${BRANCH_LABELS[b]} branch…`}
                      className="input text-[13px] w-full resize-y" style={{ minHeight: 90 }} />
                  ) : (
                    <p className="text-[13px] text-[var(--charcoal)] whitespace-pre-wrap leading-relaxed">
                      {(branchInfo.find((x) => x.branch === b)?.info || '').trim() || <span className="text-[var(--mid-gray)] italic">No information yet.</span>}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── EMAILS ── */}
          {tab === 'emails' && (
            <div>
              {isAdmin && (
                <div className="mb-4">
                  {!showEmailForm ? (
                    <button onClick={() => { resetEmailForm(); setShowEmailForm(true) }} className="btn-primary !py-2 !px-4 !text-[13px] !rounded-lg">
                      <Plus size={15} /> Add Email
                    </button>
                  ) : (
                    <div className="card-static">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="font-bold text-[var(--charcoal)] text-[15px]" style={{ fontFamily: 'var(--font-display)' }}>{editEmailId ? 'Edit Email' : 'New Email'}</h2>
                        <button onClick={resetEmailForm} className="p-1 text-[var(--mid-gray)] hover:text-[var(--charcoal)]"><X size={18} /></button>
                      </div>
                      <label className="block text-[11px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-2">Department(s)</label>
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
                      <label className="block text-[11px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-2">Branch(es)</label>
                      <div className="mb-4"><BranchPicker selected={branchSel} onToggle={(b) => setBranchSel((p) => p.includes(b) ? p.filter((x) => x !== b) : [...p, b])} accent="gold" /></div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                        <div>
                          <label className="block text-[11px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-1">Email</label>
                          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@sapphireclinicseast.org" className="input text-[13px]" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-1">Description</label>
                          <input value={emailDesc} onChange={(e) => setEmailDesc(e.target.value)} placeholder="e.g. OT booking & inquiries" className="input text-[13px]" />
                        </div>
                      </div>
                      <label className="block text-[11px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-2">Who can view this email?</label>
                      <div className="flex flex-col gap-2 mb-4">
                        <label className="flex items-center gap-2 text-[13px] cursor-pointer text-[var(--charcoal)]"><input type="radio" checked={!restrictView} onChange={() => { setRestrictView(false); setViewSel([]) }} /> Everyone</label>
                        <label className="flex items-center gap-2 text-[13px] cursor-pointer text-[var(--charcoal)]"><input type="radio" checked={restrictView} onChange={() => setRestrictView(true)} /> Only staff from specific branches</label>
                        {restrictView && <div className="sm:pl-6"><BranchPicker selected={viewSel} onToggle={(b) => setViewSel((p) => p.includes(b) ? p.filter((x) => x !== b) : [...p, b])} /></div>}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={saveEmail} disabled={savingEmail} className="btn-primary !py-2 !px-5 !text-[13px] !rounded-lg">
                          {savingEmail ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {editEmailId ? 'Save Changes' : 'Add Email'}
                        </button>
                        <button onClick={resetEmailForm} className="btn-secondary !py-2 !px-5 !text-[13px] !rounded-lg">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {entries.length > 0 && (
                <div className="relative mb-3 sm:max-w-xs">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mid-gray)]" />
                  <input value={emailQ} onChange={(e) => setEmailQ(e.target.value)} placeholder="Filter emails…" className="input text-[13px] !pl-9" />
                </div>
              )}
              <div className="card-static !p-0 overflow-hidden">
                {entries.length === 0 ? (
                  <div className="py-12 text-center text-[var(--mid-gray)] text-[13px]"><Mail size={26} className="mx-auto mb-2 opacity-40" />No emails yet.</div>
                ) : (
                  <div>
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-wider text-[var(--mid-gray)]" style={{ background: 'var(--off-white)' }}>
                          <SortableTh label="Department" col="dept" sort={emailSort} onToggle={(c) => toggleSort(setEmailSort, c)} />
                          <SortableTh label="Branch" col="branch" sort={emailSort} onToggle={(c) => toggleSort(setEmailSort, c)} />
                          <SortableTh label="Email" col="email" sort={emailSort} onToggle={(c) => toggleSort(setEmailSort, c)} />
                          <SortableTh label="Description" col="desc" sort={emailSort} onToggle={(c) => toggleSort(setEmailSort, c)} />
                          {isAdmin && <th className="px-5 py-3 font-semibold">Visible To</th>}
                          {isAdmin && <th className="px-5 py-3 font-semibold w-20"></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleEmails.length === 0 && (
                          <tr><td colSpan={isAdmin ? 6 : 4} className="px-5 py-10 text-center text-[13px] text-[var(--mid-gray)]">No emails match “{emailQ}”.</td></tr>
                        )}
                        {visibleEmails.map((e) => (
                          <tr key={e.id} className="border-t border-[var(--light-gray)] align-top">
                            <td className="px-5 py-3"><div className="flex flex-wrap gap-1.5">{sortDepts(e.departments).map((d) => <span key={d} className="px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>{DEPT_LABELS[d] ?? d}</span>)}</div></td>
                            <td className="px-5 py-3"><div className="flex flex-wrap gap-1.5">{sortBranches(e.branches ?? []).map((b) => <span key={b} className="px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider" style={{ background: 'var(--sun-tint)', color: '#8a6a1f' }}>{BRANCH_LABELS[b] ?? b}</span>)}</div></td>
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
                                  <button onClick={() => startEditEmail(e)} className="p-1.5 text-[var(--teal)] hover:bg-[var(--pale-teal)] rounded-md" title="Edit"><Pencil size={14} /></button>
                                  <button onClick={() => removeEmail(e.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-md" title="Remove"><Trash2 size={14} /></button>
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
                    <button onClick={() => { resetWebForm(); setShowWebForm(true) }} className="btn-primary !py-2 !px-4 !text-[13px] !rounded-lg">
                      <Plus size={15} /> Add Website
                    </button>
                  ) : (
                    <div className="card-static">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="font-bold text-[var(--charcoal)] text-[15px]" style={{ fontFamily: 'var(--font-display)' }}>{editWebId ? 'Edit Website' : 'New Website'}</h2>
                        <button onClick={resetWebForm} className="p-1 text-[var(--mid-gray)] hover:text-[var(--charcoal)]"><X size={18} /></button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                        <div>
                          <label className="block text-[11px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-1">Link</label>
                          <input value={wLink} onChange={(e) => setWLink(e.target.value)} placeholder="https://example.com" className="input text-[13px]" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-1">Description</label>
                          <input value={wDesc} onChange={(e) => setWDesc(e.target.value)} placeholder="e.g. PhilHealth portal" className="input text-[13px]" />
                        </div>
                      </div>
                      <label className="block text-[11px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-2">Who can view this link?</label>
                      <div className="flex flex-col gap-2 mb-4">
                        <label className="flex items-center gap-2 text-[13px] cursor-pointer text-[var(--charcoal)]"><input type="radio" checked={!wRestrict} onChange={() => { setWRestrict(false); setWViewSel([]) }} /> Everyone</label>
                        <label className="flex items-center gap-2 text-[13px] cursor-pointer text-[var(--charcoal)]"><input type="radio" checked={wRestrict} onChange={() => setWRestrict(true)} /> Only staff from specific branches</label>
                        {wRestrict && <div className="sm:pl-6"><BranchPicker selected={wViewSel} onToggle={(b) => setWViewSel((p) => p.includes(b) ? p.filter((x) => x !== b) : [...p, b])} /></div>}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={saveWeb} disabled={savingWeb} className="btn-primary !py-2 !px-5 !text-[13px] !rounded-lg">
                          {savingWeb ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {editWebId ? 'Save Changes' : 'Add Website'}
                        </button>
                        <button onClick={resetWebForm} className="btn-secondary !py-2 !px-5 !text-[13px] !rounded-lg">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {websites.length > 0 && (
                <div className="relative mb-3 sm:max-w-xs">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mid-gray)]" />
                  <input value={webQ} onChange={(e) => setWebQ(e.target.value)} placeholder="Filter websites…" className="input text-[13px] !pl-9" />
                </div>
              )}
              <div className="card-static !p-0 overflow-hidden">
                {websites.length === 0 ? (
                  <div className="py-12 text-center text-[var(--mid-gray)] text-[13px]"><Globe size={26} className="mx-auto mb-2 opacity-40" />No websites yet.</div>
                ) : (
                  <div>
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-wider text-[var(--mid-gray)]" style={{ background: 'var(--off-white)' }}>
                          <SortableTh label="Link" col="link" sort={webSort} onToggle={(c) => toggleSort(setWebSort, c)} />
                          <SortableTh label="Description" col="desc" sort={webSort} onToggle={(c) => toggleSort(setWebSort, c)} />
                          {isAdmin && <th className="px-5 py-3 font-semibold">Visible To</th>}
                          {isAdmin && <th className="px-5 py-3 font-semibold w-20"></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleWebsites.length === 0 && (
                          <tr><td colSpan={isAdmin ? 4 : 2} className="px-5 py-10 text-center text-[13px] text-[var(--mid-gray)]">No websites match “{webQ}”.</td></tr>
                        )}
                        {visibleWebsites.map((w) => (
                          <tr key={w.id} className="border-t border-[var(--light-gray)] align-top">
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
                                  <button onClick={() => startEditWeb(w)} className="p-1.5 text-[var(--teal)] hover:bg-[var(--pale-teal)] rounded-md" title="Edit"><Pencil size={14} /></button>
                                  <button onClick={() => removeWeb(w.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-md" title="Remove"><Trash2 size={14} /></button>
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
