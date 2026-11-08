'use client'

import { useState, useEffect, useCallback, useRef, type CSSProperties, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { flashRow } from '@/lib/highlight-row'
import { localTodayStr } from '@/lib/utils'
import {
  FileText, QrCode, BarChart3, ExternalLink, Copy, Check,
  RefreshCw, Download, ChevronRight, Trash2, Pencil, X, Settings,
  ArrowLeft, Search, SearchX, AlertTriangle, Inbox, Sparkles, UserCheck, UserX, Star,
  Paperclip, IdCard, FileImage, Eye, Clock, Building2, Phone, Users, Stethoscope,
  ShieldCheck, User, Loader2, ListChecks, Info, Plus,
} from 'lucide-react'
import { CARD_STYLE, KpiCard, Skeleton, EmptyState } from '../patients/dashboard/ui'

// ── Form definitions ─────────────────────────────────────────────────────────
// `comboSlug` is a branch chooser on HR: one link that asks which branch and
// sends the person to the right form. It exists so a poster can carry a single
// QR code covering both branches instead of two codes people have to read
// labels to tell apart. Nothing is collected on it — responses still land in
// the per-branch forms, so the Responses tab is unaffected.
const FORM_TYPES: Array<{ key: string; title: string; sbea: string; sbgh: string | null; subtitle?: string; intro?: string; sbeaSlug?: string; sbghSlug?: string; comboSlug?: string }> = [
  { key: 'registration',  title: 'Registration Form',          sbea: 'GULaVBpI', sbgh: 'VaCB1bkE', sbeaSlug: 'RegistrationEast', sbghSlug: 'RegistrationGH', comboSlug: 'Registration' },
  { key: 'group-therapy', title: 'Group Therapy Registration', sbea: 'ChrSrsBF', sbgh: 'tT8QASYo' },
  {
    key:      'sip',
    title:    'ALAGA Program Registration',
    subtitle: 'Allied Learners Advancing Genuine Access',
    intro:    'The ALAGA Program pairs patients with student therapists who are completing their clinical internship hours — all sessions are directly supervised by our licensed clinicians. Because sessions are conducted under supervised training, they are offered at a significantly lower fee than our regular therapy rates, making quality rehabilitation more accessible to families.',
    sbea:     'SGWVxqcW',
    // Greenhills activated — form i8rFr7P6 ("AHGH ALAGA Program Registration")
    // already existed in the HR Platform but was never wired up here. Which
    // departments each branch offers is now managed per-form in Settings
    // rather than by editing the form definition.
    sbgh:     'i8rFr7P6',
  },
  { key: 'psych',         title: 'Psych Registration Form',    sbea: 'X2YDKTaH', sbgh: null },
]

const HR_FORM_BASE = 'https://hr.sapphireclinicseast.org/forms/fill/'

// Partner institutions get priority — the front desk should schedule them first.
//
// This list is now editable in Settings, so it is fetched rather than hardcoded:
// a hardcoded copy would stop matching the form the moment someone added a
// partner, and the badge would silently go missing for exactly the registrations
// it exists to highlight. The constant below is only a fallback for when the
// form service can't be reached, so an outage degrades the badge rather than
// removing it.
const PARTNER_INSTITUTIONS_FALLBACK = [
  'Asian Institute of Management', 'BOMBA Pilipinas', 'Light Bearer Christian Academy',
  'NU East Ortigas', "The Abba's Orchard", 'Xavier School San Juan',
]

// Compared case-insensitively: the form stores what an admin typed, and a
// stray capital shouldn't drop the flag.
function isPartnerResponse(item: any, partners: Set<string>): boolean {
  if (partners.size === 0) return false
  const hit = (l: unknown) => typeof l === 'string' && partners.has(l.trim().toLowerCase())
  return (item?.answers || []).some((a: any) => {
    if (hit(a?.choice?.label)) return true
    if (Array.isArray(a?.choices?.labels)) return a.choices.labels.some(hit)
    return false
  })
}

/**
 * The answer a given column holds for a given response.
 *
 * Used by the cell, the column filter and the sort, so the three cannot
 * disagree about what a column contains. Matches on any id the column was
 * merged from, then on the question title — the same question carries a
 * different id in each branch's form.
 */
function answerFor(item: any, field: any): any {
  const ids: string[] = field?.ids ?? [field?.id]
  const title = String(field?.title ?? '').trim().toLowerCase()
  return (item?.answers || []).find((a: any) =>
    ids.includes(a.field?.id)
    || (title && String(a.field?.title ?? '').trim().toLowerCase() === title))
}

type FormType = typeof FORM_TYPES[0]
interface ResponseItem {
  landing_id: string
  submitted_at: string
  answers: any[]
  _branch?: string
  _formId?: string
}

interface Props { role: string }

export default function RegistrationFormsClient({ role }: Props) {
  const [selectedForm, setSelectedForm] = useState<FormType | null>(null)
  // Live partner names for the selected form, lowercased for matching. Unions
  // both branch forms because the responses table can list both at once.
  const [partnerNames, setPartnerNames] = useState<Set<string>>(
    () => new Set(PARTNER_INSTITUTIONS_FALLBACK.map(n => n.toLowerCase())),
  )
  const [tab, setTab]                   = useState<'qr' | 'results' | 'settings'>('qr')
  // 'BOTH' is QR-and-link only. The Settings tabs edit one branch's form, so
  // they coerce it back to a real branch rather than trying to edit two.
  const [qrBranch, setQrBranch]         = useState<'SBEA' | 'SBGH' | 'BOTH'>('SBEA')
  const settingsBranch: 'SBEA' | 'SBGH' = qrBranch === 'BOTH' ? 'SBEA' : qrBranch
  const [copied, setCopied]             = useState(false)
  const [results, setResults]           = useState<{ fields: any[]; items: ResponseItem[]; total: number } | null>(null)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')
  const [deletingId, setDeletingId]     = useState<string | null>(null)
  const [editingItem, setEditingItem]   = useState<ResponseItem | null>(null)
  const [editValues, setEditValues]     = useState<Record<string, string>>({})
  const [saving, setSaving]             = useState(false)
  const [newCutoff, setNewCutoff]       = useState<Date | null>(null)
  // ── Table controls: sort, per-column filter, column widths ──
  // 374 rows across two branches is past the point where scrolling and reading
  // is a workable way to find anything.
  const [sortCol, setSortCol]   = useState<string>('submitted')
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('desc')
  const [colFilters, setColFilters] = useState<Record<string, string>>({})
  // Ticked values per column, for the columns that offer a dropdown. Free-text
  // columns keep colFilters above — a name or an email has as many distinct
  // values as it has rows, so a tick list there would be the table again.
  const [colPicks, setColPicks] = useState<Record<string, string[]>>({})
  // Which column's dropdown is open. One at a time, so opening a second closes
  // the first rather than leaving two panels over the table.
  const [openPick, setOpenPick] = useState<string | null>(null)
  // Row status filter. Empty set = show everything; ticks are OR-ed, so
  // Converted + For prioritization shows either.
  const [statusPicks, setStatusPicks] = useState<string[]>([])
  const [colWidths, setColWidths] = useState<Record<string, number>>({})
  const resizing = useRef<{ key: string; startX: number; startW: number } | null>(null)
  // Display only: a free-text search over the loaded rows, and which response
  // the detail panel shows. Neither reaches the API.
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  useEffect(() => {
    if (!openId) return
    // Escape closes the panel, but not from under the edit modal on top of it.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !editingItem) setOpenId(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId, editingItem])

  // Drag a header edge to size a column. Listeners live on the document so the
  // drag survives the pointer leaving the 2px handle, which is otherwise very
  // easy to do and makes resizing feel broken.
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const r = resizing.current
      if (!r) return
      const next = Math.max(70, r.startW + (e.clientX - r.startX))
      setColWidths(w => ({ ...w, [r.key]: next }))
    }
    const up = () => { resizing.current = null; document.body.style.cursor = '' }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
    return () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up) }
  }, [])

  const startResize = (key: string, e: React.MouseEvent, currentWidth: number) => {
    e.preventDefault(); e.stopPropagation()
    resizing.current = { key, startX: e.clientX, startW: colWidths[key] ?? currentWidth }
    document.body.style.cursor = 'col-resize'
  }

  const toggleSort = (key: string) => {
    if (sortCol === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(key); setSortDir('asc') }
  }

  // Determine the "new since" cutoff for highlighting.
  // If the user navigated here by clicking the notification bell, the URL
  // carries ?newSince=<ISO> (the dismissedAt value captured BEFORE dismiss()
  // ran), so we use that snapshot. Otherwise fall back to fetching the
  // current per-user state from the notifications API.
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const urlNewSince = urlParams.get('newSince')
    if (urlNewSince) {
      setNewCutoff(new Date(urlNewSince))
    } else {
      fetch('/api/notifications', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => { if (d.dismissedAt) setNewCutoff(new Date(d.dismissedAt)) })
        .catch(() => {})
    }
  }, [])

  // Fetch all patient names so we can mark already-converted respondents
  const [patientNames, setPatientNames] = useState<Set<string>>(new Set())
  useEffect(() => {
    fetch('/api/patients?limit=10000')
      .then(r => r.json())
      .then(d => {
        const names = new Set<string>()
        for (const p of (d.patients || [])) {
          const n = `${p.firstName || ''} ${p.lastName || ''}`.trim().toLowerCase()
          if (n) names.add(n)
        }
        setPatientNames(names)
      })
      .catch(() => {})
  }, [])

  const isSBEA     = role.startsWith('SBEA')
  const isSBGH     = role.startsWith('SBGH')
  const branchRole = isSBEA ? 'SBEA' : isSBGH ? 'SBGH' : null
  const isAdmin    = !branchRole

  // Front desk users only see forms available for their branch
  const visibleForms = FORM_TYPES.filter(f => {
    if (isAdmin || isSBEA) return true
    return !!f.sbgh  // SBGH front desk only sees forms with SBGH version
  })

  // Deep-link support: /registration-forms?form=<key>&tab=results&branch=SBEA
  // Used by the notification bell to jump straight to a form's Responses tab.
  const searchParams   = useSearchParams()
  const deepLinked     = useRef(false)
  useEffect(() => {
    if (deepLinked.current) return
    const formKey  = searchParams.get('form')
    const tabParam = searchParams.get('tab')
    const branch   = searchParams.get('branch') as 'SBEA' | 'SBGH' | null
    if (!formKey) return
    const form = visibleForms.find((f) => f.key === formKey)
    if (!form) return
    deepLinked.current = true
    setSelectedForm(form)
    if (tabParam === 'results') setTab('results')
    if (branch === 'SBEA' || branch === 'SBGH') setQrBranch(branch)
  }, [searchParams, visibleForms])

  // Put the eye on the submission the notification was about. Runs off `results`
  // rather than the deep-link effect above: the row does not exist until the
  // responses have loaded, and landing on a list of 40 submissions with no idea
  // which one was clicked is barely better than not linking at all.
  const highlighted = useRef<string | null>(null)
  useEffect(() => {
    const responseId = searchParams.get('response')
    if (!responseId || !results?.items.length) return
    if (highlighted.current === responseId) return   // don't re-flash on refetch
    highlighted.current = responseId
    return flashRow(responseId)
  }, [searchParams, results])

  // Reset qrBranch when form changes
  useEffect(() => {
    if (selectedForm) setQrBranch(isSBGH ? 'SBGH' : 'SBEA')
  }, [selectedForm, isSBGH])

  useEffect(() => {
    if (!selectedForm) return
    let cancelled = false
    const ids = [selectedForm.sbea, selectedForm.sbgh].filter(Boolean) as string[]
    Promise.all(ids.map(id =>
      fetch(`/api/registration-forms/${id}/partner-options`)
        .then(r => r.json())
        .then(d => (d?.ok && Array.isArray(d.names) ? d.names : []))
        .catch(() => []),
    )).then(lists => {
      if (cancelled) return
      const all = lists.flat().map((n: string) => n.trim().toLowerCase()).filter(Boolean)
      // Keep the fallback if the service answered with nothing — an empty set
      // would quietly un-flag every partner registration.
      if (all.length > 0) setPartnerNames(new Set(all))
    })
    return () => { cancelled = true }
  }, [selectedForm])

  // Public link prefers a clean slug when the form defines one, falling back to
  // the raw id. Response-fetching still uses the ids (form.sbea / form.sbgh).
  const getFormUrl = (form: FormType, branch: 'SBEA' | 'SBGH' | 'BOTH') => {
    // The chooser is a slug of its own — it has no form id to fall back to.
    if (branch === 'BOTH' && form.comboSlug) return HR_FORM_BASE + form.comboSlug
    const useSbgh = branch === 'SBGH' && !!form.sbgh
    const slug = useSbgh ? form.sbghSlug : form.sbeaSlug
    const id   = useSbgh ? form.sbgh : form.sbea
    return HR_FORM_BASE + (slug || id)
  }

  const copyLink = useCallback((url: string) => {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  const loadResults = useCallback(async (form: FormType) => {
    setLoading(true); setError('')
    try {
      const hasBoth = !!form.sbgh && form.sbgh !== form.sbea

      const [res1, res2] = await Promise.all([
        fetch(`/api/registration-forms/${form.sbea}/responses`),
        hasBoth ? fetch(`/api/registration-forms/${form.sbgh}/responses`) : Promise.resolve(null),
      ])
      const d1 = await res1.json()
      if (!d1.ok) throw new Error(d1.error || 'Failed to load')

      let fields = d1.fields || []
      let items: ResponseItem[] = (d1.items || []).map((i: any) => ({ ...i, _branch: 'SBEA', _formId: form.sbea }))

      if (res2) {
        const d2 = await res2.json()
        if (d2.ok) {
          const sbghItems: ResponseItem[] = (d2.items || []).map((i: any) => ({ ...i, _branch: 'SBGH', _formId: form.sbgh }))
          items = [...items, ...sbghItems].sort(
            (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
          )

          // Columns are the UNION of both forms' questions, matched by title.
          //
          // They used to be East's fields alone while the rows were both
          // branches', and a cell was looked up by field ID. Greenhills has its
          // own IDs for the same questions, so every Greenhills answer missed
          // every column and the row rendered as a line of dashes — which read
          // as "the system accepted a blank submission" when the answers were
          // there all along, under a different id.
          const byTitle = new Map<string, any>()
          for (const f of [...fields, ...(d2.fields || [])]) {
            const key = String(f.title ?? '').trim().toLowerCase()
            if (!key) continue
            const seen = byTitle.get(key)
            if (seen) {
              // Same question, two form ids. Keep both so either branch's
              // answer can be found for this column.
              seen.ids.push(f.id)
            } else {
              byTitle.set(key, { ...f, ids: [f.id] })
            }
          }
          fields = [...byTitle.values()]
        }
      }

      // Front desk: only show their branch
      if (branchRole) items = items.filter(i => i._branch === branchRole)

      setResults({ fields, items, total: items.length })
    } catch (e: any) {
      setError(e.message); setResults(null)
    } finally {
      setLoading(false)
    }
  }, [branchRole])

  const handleDelete = useCallback(async (item: ResponseItem) => {
    if (!confirm('Delete this response? This cannot be undone.')) return
    setDeletingId(item.landing_id)
    try {
      const res = await fetch(`/api/registration-forms/${item._formId}/responses/${item.landing_id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      setResults(prev => prev ? { ...prev, items: prev.items.filter(i => i.landing_id !== item.landing_id), total: prev.total - 1 } : prev)
    } catch (e: any) {
      alert('Delete failed: ' + e.message)
    } finally {
      setDeletingId(null)
    }
  }, [])

  const openEdit = useCallback((item: ResponseItem, fields: any[]) => {
    const vals: Record<string, string> = {}
    fields.forEach(f => {
      const ans = (item.answers || []).find((a: any) => a.field?.id === f.id)
      vals[f.id] = extractAnswer(ans)
    })
    setEditValues(vals)
    setEditingItem(item)
  }, [])

  const saveEdit = useCallback(async () => {
    if (!editingItem || !results) return
    setSaving(true)
    try {
      const updatedAnswers = editingItem.answers.map((ans: any) => {
        const newVal = editValues[ans.field?.id]
        if (newVal === undefined) return ans
        // Preserve type, update whichever value field applies
        const updated = { ...ans }
        if (ans.type === 'text' || ans.type === 'file_url') updated.text = newVal
        else if (ans.type === 'email') updated.email = newVal
        else if (ans.type === 'phone_number') updated.phone_number = newVal
        else if (ans.type === 'choice') updated.choice = { ...(ans.choice || {}), label: newVal }
        else if (ans.type === 'date') updated.date = newVal
        else updated.text = newVal
        return updated
      })
      const res = await fetch(`/api/registration-forms/${editingItem._formId}/responses/${editingItem.landing_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: updatedAnswers }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      setResults(prev => prev ? {
        ...prev,
        items: prev.items.map(i => i.landing_id === editingItem.landing_id ? { ...i, answers: updatedAnswers } : i),
      } : prev)
      setEditingItem(null)
    } catch (e: any) {
      alert('Save failed: ' + e.message)
    } finally {
      setSaving(false)
    }
  }, [editingItem, editValues, results])

  const exportCSV = useCallback(() => {
    if (!results?.items.length || !selectedForm) return
    const esc = (v: string) => `"${String(v || '').replace(/"/g, '""')}"`
    const hasBoth = isAdmin && !!selectedForm.sbgh
    const headers = ['#', 'Submitted At', ...(hasBoth ? ['Branch'] : []), ...results.fields.map((f: any) => f.title)]
    const rows = results.items.map((item, i) => [
      i + 1,
      item.submitted_at ? new Date(item.submitted_at).toLocaleString('en-US', { timeZone: 'Asia/Manila' }) : '',
      ...(hasBoth ? [item._branch || ''] : []),
      ...results.fields.map((field: any) => {
        const ans = (item.answers || []).find((a: any) => a.field?.id === field.id)
        return extractAnswer(ans)
      }),
    ])
    const csv = [headers.map(esc).join(','), ...rows.map(r => r.map(v => esc(String(v))).join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `${selectedForm.title.replace(/[^a-zA-Z0-9]/g, '_')}_${localTodayStr()}.csv`
    a.click(); URL.revokeObjectURL(url)
  }, [results, selectedForm, isAdmin])

  // The response whose detail panel is open. Looked up from `results` rather
  // than held as a copy, so an edit shows straight away and a delete closes it.
  const opened = openId && results ? results.items.find(i => i.landing_id === openId) ?? null : null
  const goBack = () => { setSelectedForm(null); setResults(null); setTab('qr') }
  const qrLabel = (b: 'SBEA' | 'SBGH' | 'BOTH') => b === 'SBEA' ? 'East Branch' : b === 'SBGH' ? 'Greenhills Branch' : 'Both Branches'

  return (
    <div className="max-w-[1200px] mx-auto space-y-5 min-w-0">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>Clinic Tools</p>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            {selectedForm ? selectedForm.title : 'Registration Forms'}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
            {selectedForm ? (
              <>
                {selectedForm.subtitle && (
                  <span className="font-medium italic" style={{ color: 'var(--teal)' }}>{selectedForm.subtitle} · </span>
                )}
                {selectedForm.sbgh ? 'East Branch · Greenhills Branch' : 'East Branch only'}
              </>
            ) : (
              'Patient registration forms — share the link or QR, review responses, and manage what each form offers.'
            )}
          </p>
        </div>
        {selectedForm && (
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={goBack} className={BTN_SECONDARY} style={CONTROL_STYLE}>
              <ArrowLeft size={14} style={{ color: 'var(--teal)' }} /> All forms
            </button>
            {tab === 'results' && (
              <>
                <button onClick={() => loadResults(selectedForm)} disabled={loading} className={BTN_SECONDARY} style={CONTROL_STYLE} title="Reload the responses">
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} style={{ color: 'var(--teal)' }} /> Refresh
                </button>
                <button onClick={exportCSV} disabled={!results?.items.length} className={BTN_PRIMARY} style={{ background: 'var(--teal)' }}>
                  <Download size={14} /> Export CSV
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {selectedForm ? (
        /* ── Form Detail View ─────────────────────────────────────── */
        <>
          {selectedForm.intro && (
            <div className="flex items-start gap-3 rounded-xl px-4 py-3" style={{ background: '#F1F7F5', border: '1px solid #CBE3DC' }}>
              <Info size={15} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--teal)' }} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className={SECTION_LABEL} style={{ color: 'var(--teal)' }}>About this program</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold leading-4" style={{ background: '#fff', color: 'var(--teal)', border: '1px solid #CBE3DC' }}>
                    Lower fee than regular sessions
                  </span>
                </div>
                <p className="text-[13px] leading-relaxed m-0" style={{ color: 'var(--charcoal)' }}>{selectedForm.intro}</p>
              </div>
            </div>
          )}

          {/* Sub-tabs */}
          <div role="tablist" aria-label="Form sections" className="inline-flex flex-wrap gap-1 p-1 rounded-xl" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
            {[
              { key: 'qr' as const, label: 'QR & Link', icon: QrCode },
              { key: 'results' as const, label: 'Responses', icon: BarChart3 },
              { key: 'settings' as const, label: 'Settings', icon: Settings },
            ].map(t => {
              const on = tab === t.key
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={on}
                  onClick={() => { setTab(t.key); if (t.key === 'results' && !results) loadResults(selectedForm) }}
                  className="inline-flex items-center gap-2 h-8 px-4 rounded-lg text-sm font-semibold transition-all"
                  style={on
                    ? { background: '#fff', color: 'var(--charcoal)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
                    : { color: 'var(--mid-gray)' }}
                >
                  <t.icon size={14} style={{ color: on ? 'var(--teal)' : undefined }} />
                  {t.label}
                  {t.key === 'results' && results && (
                    <span className="px-1.5 rounded-full text-[10.5px] font-bold tabular-nums leading-4"
                      style={{ background: on ? 'var(--teal)' : 'var(--light-gray)', color: on ? '#fff' : 'var(--charcoal)' }}>
                      {results.total}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {tab === 'settings' && (
            <div className="grid gap-5 lg:grid-cols-2 items-start min-w-0">
              <ServiceOptionsSettings
                formId={settingsBranch === 'SBGH' && selectedForm.sbgh ? selectedForm.sbgh : selectedForm.sbea}
                branchLabel={settingsBranch === 'SBGH' && selectedForm.sbgh ? 'Greenhills Branch' : 'East Branch'}
                canEdit={isAdmin}
                showBranchToggle={isAdmin && !!selectedForm.sbgh}
                qrBranch={settingsBranch}
                onBranchChange={setQrBranch}
              />
              <PartnerInstitutionsSettings
                formId={settingsBranch === 'SBGH' && selectedForm.sbgh ? selectedForm.sbgh : selectedForm.sbea}
                branchLabel={settingsBranch === 'SBGH' && selectedForm.sbgh ? 'Greenhills Branch' : 'East Branch'}
                canEdit={isAdmin}
              />
            </div>
          )}

          {tab === 'qr' && (
            <section className="rounded-xl overflow-hidden min-w-0" style={CARD_STYLE}>
              <header className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--light-gray)' }}>
                <h2 className="flex items-center gap-2 text-[14px] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                  <QrCode size={15} style={{ color: 'var(--teal)' }} /> Share the form
                </h2>
                <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>
                  Print the QR for the counter or a poster, or copy the link to send to a patient.
                </p>
              </header>
              <div className="p-5 grid gap-6 md:grid-cols-[auto_minmax(0,1fr)] items-start">
                {/* QR Code */}
                <div className="flex flex-col items-center">
                  <div className="p-3 rounded-2xl" style={{ border: '1px solid var(--light-gray)', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(getFormUrl(selectedForm, qrBranch))}`}
                      alt="QR Code"
                      width={220}
                      height={220}
                    />
                  </div>
                  <span className="mt-3"><QrBranchBadge branch={qrBranch} label={qrLabel(qrBranch)} /></span>
                </div>

                <div className="min-w-0 space-y-4">
                  {/* Branch toggle — hidden for single-branch front desk */}
                  {(isAdmin || (!!selectedForm.sbgh && !branchRole)) && (
                    <div>
                      <p className={`${SECTION_LABEL} mb-1.5`} style={{ color: 'var(--mid-gray)' }}>Branch</p>
                      <div className="inline-flex flex-wrap gap-1 p-1 rounded-xl" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
                        {([
                          'SBEA',
                          'SBGH',
                          // Only where a chooser link exists for this form.
                          ...(selectedForm.comboSlug && selectedForm.sbgh ? (['BOTH'] as const) : []),
                        ] as const).map(b => {
                          const available = b === 'SBEA' || b === 'BOTH' ? true : !!selectedForm.sbgh
                          const label = qrLabel(b)
                          return (
                            <button
                              key={b}
                              onClick={() => available && setQrBranch(b)}
                              disabled={!available}
                              className="h-8 px-4 rounded-lg text-sm font-semibold transition-all"
                              style={
                                qrBranch === b
                                  ? { background: 'var(--teal)', color: '#fff' }
                                  : { color: available ? 'var(--mid-gray)' : '#C4C9CC', cursor: available ? 'pointer' : 'not-allowed' }
                              }
                            >
                              {label}
                              {!available && <span className="ml-1 text-xs opacity-60">(soon)</span>}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Link */}
                  <div>
                    <p className={`${SECTION_LABEL} mb-1.5`} style={{ color: 'var(--mid-gray)' }}>Form link</p>
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        readOnly
                        aria-label="Form link"
                        value={getFormUrl(selectedForm, qrBranch)}
                        className={`${CONTROL} flex-1 min-w-0`}
                        style={{ ...CONTROL_STYLE, background: SUBTLE_BG, color: 'var(--mid-gray)' }}
                        onFocus={e => e.currentTarget.select()}
                      />
                      <button
                        onClick={() => copyLink(getFormUrl(selectedForm, qrBranch))}
                        className={BTN_PRIMARY}
                        style={{ background: 'var(--teal)' }}
                      >
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <a
                    href={getFormUrl(selectedForm, qrBranch)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={BTN_SECONDARY}
                    style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}
                  >
                    Open form <ExternalLink size={13} />
                  </a>

                  {qrBranch === 'BOTH' && (
                    <div className="flex items-start gap-2 rounded-lg px-3 py-2.5" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
                      <Info size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--teal)' }} />
                      <p className="text-xs leading-relaxed m-0" style={{ color: 'var(--charcoal)' }}>
                        Use this one on posters covering both clinics — it asks which branch, then
                        opens that branch&apos;s form. Responses still arrive under the branch chosen.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {tab === 'results' && (
            <>
              {error && (
                <div role="alert" className="rounded-xl text-center px-6 py-10" style={{ background: '#fff', border: '1px solid #FECACA' }}>
                  <AlertTriangle size={20} className="mx-auto mb-2" style={{ color: '#DC2626' }} />
                  <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Couldn&rsquo;t load responses</p>
                  <p className="text-xs mt-1 max-w-md mx-auto" style={{ color: '#991B1B' }}>{error}</p>
                  <button onClick={() => loadResults(selectedForm)} disabled={loading} className={`${BTN_SECONDARY} mt-4 text-xs`} style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}>
                    <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Try again
                  </button>
                </div>
              )}

              {loading && !results && <ResultsSkeleton />}

              {results && results.items.length === 0 && (
                <section className="rounded-xl flex flex-col items-center" style={CARD_STYLE}>
                  <Inbox size={26} className="mt-10 -mb-8" style={{ color: 'var(--light-gray)' }} />
                  <EmptyState title="No responses yet." hint="Share the form link or QR — registrations appear here as soon as they are submitted." />
                </section>
              )}

              {results && results.items.length > 0 && (() => {
                  // Filter, then sort. Both read a column through answerFor(),
                  // the same accessor the cell uses, so what is filtered on is
                  // exactly what is displayed.
                  // A "contact" question stores first name, last name, phone
                  // and email separately and the form flattens them into one
                  // string — "Zydney , Mercado, 09657412812, …@gmail.com" in a
                  // single cell. The parts are all there in answer.contact, so
                  // the column is split into three instead of being read as one
                  // run-on line. Detected from the answers rather than the field
                  // definition, since the merged column carries an id per branch.
                  const contactIds = new Set<string>()
                  for (const it of results.items)
                    for (const a of (it.answers || []))
                      if (a?.contact && a.field?.id) contactIds.add(String(a.field.id))
                  const isContact = (f: any) =>
                    (f?.ids ?? [f?.id]).some((id: any) => contactIds.has(String(id)))

                  type DisplayCol = { key: string; label: string; field?: any; part?: 'name' | 'phone' | 'email'; w: number }
                  const displayCols: DisplayCol[] = results.fields.flatMap((f: any) => isContact(f)
                    ? [
                        { key: `${f.id}::name`,  label: `${f.title} — Name`,  field: f, part: 'name'  as const, w: 190 },
                        { key: `${f.id}::phone`, label: `${f.title} — Phone`, field: f, part: 'phone' as const, w: 140 },
                        { key: `${f.id}::email`, label: `${f.title} — Email`, field: f, part: 'email' as const, w: 220 },
                      ]
                    : [{ key: String(f.id), label: String(f.title ?? ''), field: f, w: 200 }])

                  const colByKey = new Map(displayCols.map(c => [c.key, c]))

                  const val = (item: ResponseItem, key: string): string => {
                    if (key === 'submitted') return item.submitted_at ?? ''
                    if (key === 'branch') return item._branch === 'SBEA' ? 'East Branch' : 'Greenhills Branch'
                    const col = colByKey.get(key)
                    if (!col?.field) return ''
                    const ans = answerFor(item, col.field)
                    if (col.part) {
                      const c = ans?.contact
                      if (!c) return ''
                      if (col.part === 'name') return `${c.first_name ?? ''} ${c.last_name ?? ''}`.replace(/\s+/g, ' ').trim()
                      if (col.part === 'phone') return c.phone_number ?? ''
                      return c.email ?? ''
                    }
                    return extractAnswer(ans) || ''
                  }

                  // Distinct values for a column, for the tick-list. A question
                  // answered from a fixed set has a handful; a name or a
                  // birthday has one per row, so those fall back to the text box
                  // rather than offering a 300-line dropdown.
                  const MAX_PICKS = 30
                  const optionsFor = (key: string): string[] => {
                    if (key === 'submitted') return []
                    const set = new Set<string>()
                    for (const it of results.items) {
                      const v = val(it, key)
                      if (!v || v === '—') continue
                      // "may choose more than 1" answers arrive comma-joined;
                      // offer the individual options so ticking one finds every
                      // row that includes it.
                      for (const part of v.split(',')) {
                        const t = part.trim()
                        if (t) set.add(t)
                      }
                      if (set.size > MAX_PICKS) return []
                    }
                    return [...set].sort((a, b) => a.localeCompare(b))
                  }

                  let rows = results.items
                  if (statusPicks.length > 0) {
                    rows = rows.filter(it => {
                      const n = getResponsePatientName(it, results.fields).toLowerCase().trim()
                      const conv = n !== '' && patientNames.has(n)
                      const prio = isPartnerResponse(it, partnerNames)
                      return statusPicks.some(sp =>
                        sp === 'converted' ? conv
                        : sp === 'not-converted' ? !conv
                        : prio)
                    })
                  }
                  // Free-text search over the registrant's name, the branch and
                  // every column — a display filter on rows already loaded.
                  const needle = search.trim().toLowerCase()
                  if (needle) {
                    rows = rows.filter(it =>
                      [getResponsePatientName(it, results.fields), val(it, 'branch'), ...displayCols.map(c => val(it, c.key))]
                        .join(' ').toLowerCase().includes(needle))
                  }
                  for (const [key, picks] of Object.entries(colPicks)) {
                    if (!picks?.length) continue
                    rows = rows.filter(it => {
                      const v = val(it, key).toLowerCase()
                      return picks.some(o => v.includes(o.toLowerCase()))
                    })
                  }
                  for (const [key, q] of Object.entries(colFilters)) {
                    const needle = q.trim().toLowerCase()
                    if (!needle) continue
                    rows = rows.filter(it => val(it, key).toLowerCase().includes(needle))
                  }
                  rows = [...rows].sort((a, b) => {
                    // Dates compare as dates; everything else as text. Sorting
                    // "Sep 5" against "Sep 20" as strings would put the 20th first.
                    if (sortCol === 'submitted') {
                      const d = new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
                      return sortDir === 'asc' ? d : -d
                    }
                    const c = val(a, sortCol).localeCompare(val(b, sortCol))
                    return sortDir === 'asc' ? c : -c
                  })

                  // Per-row display flags, worked out once and shared by the
                  // KPIs, the rows and the badges.
                  const flags = new Map<ResponseItem, RowFlags>()
                  for (const it of results.items) {
                    const name = getResponsePatientName(it, results.fields)
                    const key = name.toLowerCase().trim()
                    flags.set(it, {
                      name,
                      converted: key !== '' && patientNames.has(key),
                      partner: isPartnerResponse(it, partnerNames),
                      isNew: newCutoff && it.submitted_at ? new Date(it.submitted_at) > newCutoff : false,
                      files: attachmentsOf(it, results.fields),
                    })
                  }
                  const stats = { isNew: 0, converted: 0, partner: 0, convertedPartner: 0, files: 0, east: 0, gh: 0 }
                  for (const it of results.items) {
                    const f = flags.get(it)!
                    if (f.isNew) stats.isNew++
                    if (f.converted) stats.converted++
                    if (f.partner) stats.partner++
                    if (f.converted && f.partner) stats.convertedPartner++
                    if (f.files.length) stats.files++
                    if (it._branch === 'SBGH') stats.gh++; else stats.east++
                  }
                  const total = results.items.length
                  const pct = (n: number) => total ? Math.round((n / total) * 100) : 0
                  const showBranch = isAdmin && !!selectedForm.sbgh

                  const activeFilters =
                    statusPicks.length
                    + Object.values(colPicks).filter(v => v?.length).length
                    + Object.values(colFilters).filter(v => v.trim()).length
                    + (needle ? 1 : 0)
                  const clearAll = () => { setStatusPicks([]); setColPicks({}); setColFilters({}); setSearch('') }
                  const branchPick = colPicks.branch ?? []
                  const branchValue = branchPick.length === 1 ? branchPick[0] : ''

                  // Fixed layout needs the table's own width to be the sum of
                  // its columns, or the last column absorbs the slack and the
                  // one being dragged appears not to move.
                  const W_NAME = 240, W_ACTIONS = 116
                  const wOf = (key: string, fallback: number) => colWidths[key] ?? fallback
                  const totalWidth =
                    W_NAME + W_ACTIONS
                    + wOf('submitted', 170)
                    + (showBranch ? wOf('branch', 130) : 0)
                    + displayCols.reduce((t: number, c: DisplayCol) => t + wOf(c.key, c.w), 0)

                  const sortMark = (key: string) => sortCol === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''
                  const headFilterStyle: CSSProperties = {
                    width: '100%', marginTop: 6, height: 26, padding: '0 7px', fontSize: '0.72rem',
                    border: '1px solid var(--light-gray)', borderRadius: 6, fontWeight: 400, background: '#fff',
                    textTransform: 'none', letterSpacing: 0, color: 'var(--charcoal)', fontFamily: 'var(--font-body)',
                  }
                  const textFilter = (key: string) => (
                    <input
                      value={colFilters[key] ?? ''}
                      onChange={e => setColFilters(f => ({ ...f, [key]: e.target.value }))}
                      placeholder="Filter…"
                      onClick={e => e.stopPropagation()}
                      style={{ ...headFilterStyle, borderColor: colFilters[key]?.trim() ? 'var(--teal)' : 'var(--light-gray)' }} />
                  )

                  // A tick list for columns answered from a fixed set, a text
                  // box for everything else. Chosen from the data rather than a
                  // hardcoded column list, so a new multiple-choice question on
                  // the form gets one without anybody wiring it up.
                  const pickFilter = (key: string, opts: string[]) => {
                    const picked = colPicks[key] ?? []
                    const open = openPick === key
                    const toggle = (o: string) => setColPicks(f => {
                      const cur = f[key] ?? []
                      return { ...f, [key]: cur.includes(o) ? cur.filter(x => x !== o) : [...cur, o] }
                    })
                    return (
                      <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setOpenPick(open ? null : key)}
                          style={{
                            ...headFilterStyle, textAlign: 'left', cursor: 'pointer',
                            borderColor: picked.length ? 'var(--teal)' : 'var(--light-gray)',
                            color: picked.length ? 'var(--teal)' : 'var(--mid-gray)',
                            fontWeight: picked.length ? 600 : 400,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                          {picked.length === 0 ? 'All ▾' : `${picked.length} selected ▾`}
                        </button>
                        {open && (
                          <div style={{
                            position: 'absolute', zIndex: 30, top: 'calc(100% + 4px)', left: 0, minWidth: '100%', maxWidth: 320,
                            maxHeight: 260, overflowY: 'auto', background: '#fff', borderRadius: 10,
                            border: '1px solid var(--light-gray)', boxShadow: '0 10px 28px rgba(15,23,42,0.14)',
                            padding: 6, textTransform: 'none', letterSpacing: 0, fontWeight: 400,
                          }}>
                            {picked.length > 0 && (
                              <button onClick={() => setColPicks(f => ({ ...f, [key]: [] }))}
                                style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: '0.7rem', fontWeight: 600,
                                  color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', padding: '3px 6px' }}>
                                Clear
                              </button>
                            )}
                            {opts.map(o => (
                              <label key={o} className="hover:bg-gray-50" style={{ display: 'flex', gap: 7, alignItems: 'flex-start', padding: '4px 6px', fontSize: '0.74rem', cursor: 'pointer', borderRadius: 6, color: 'var(--charcoal)' }}>
                                <input type="checkbox" checked={picked.includes(o)} onChange={() => toggle(o)} style={{ marginTop: 2, flexShrink: 0, accentColor: 'var(--teal)' }} />
                                <span style={{ wordBreak: 'break-word' }}>{o}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  }

                  const filterInput = (key: string) => {
                    const opts = optionsFor(key)
                    return opts.length > 0 ? pickFilter(key, opts) : textFilter(key)
                  }
                  const resizeHandle = (key: string, w: number) => (
                    <span onMouseDown={e => startResize(key, e, w)} onClick={e => e.stopPropagation()} title="Drag to resize"
                      className="hover:bg-[var(--light-gray)]"
                      style={{ position: 'absolute', top: 0, right: 0, width: 5, height: '100%', cursor: 'col-resize', userSelect: 'none' }} />
                  )
                  const thClass = `text-left px-3 py-2.5 align-top ${SECTION_LABEL}`
                  const thStyle: CSSProperties = { color: 'var(--mid-gray)', borderBottom: '1px solid var(--light-gray)', position: 'relative' }

                  return (
                  <>
                  {/* ── KPIs (from the responses already loaded) ── */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    <KpiCard label="Responses" icon={<Inbox size={16} />} value={total}
                      sub={showBranch ? `East ${stats.east} · Greenhills ${stats.gh}` : branchRole === 'SBGH' ? 'Greenhills Branch' : 'East Branch'} />
                    <KpiCard label="New" icon={<Sparkles size={16} />} accent={TONE.new.fg} value={stats.isNew}
                      sub={newCutoff ? 'Since notifications were last cleared' : 'Nothing marked new'} />
                    <KpiCard label="Converted" icon={<UserCheck size={16} />} accent={TONE.converted.fg} value={stats.converted}
                      sub={`${pct(stats.converted)}% already in Patient CRM`} />
                    <KpiCard label="Not converted" icon={<UserX size={16} />} accent="#93460B" value={total - stats.converted}
                      sub="Name not found in Patient CRM" />
                    <KpiCard label="For prioritization" icon={<Star size={16} />} accent={TONE.partner.fg} value={stats.partner}
                      sub={stats.partner ? `${stats.convertedPartner} of them converted` : 'No partner registrations'} />
                  </div>

                  {/* ── Toolbar ── */}
                  {/* Partner institutions across BOTH branch forms. The column
                      filters below only search one question's text; the status
                      filter reads every answer, which is how a Greenhills
                      registration gets caught even though its question has its
                      own id. */}
                  <div className="rounded-xl px-4 py-3 space-y-2.5" style={CARD_STYLE}>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative flex-1 min-w-[220px]">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
                        <input placeholder="Search name, phone, email, any answer…" value={search} onChange={e => setSearch(e.target.value)}
                          aria-label="Search responses" className={`${CONTROL} w-full pl-8 ${search ? 'pr-8' : ''}`} style={CONTROL_STYLE} />
                        {search && (
                          <button type="button" onClick={() => setSearch('')} aria-label="Clear search"
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100" style={{ color: 'var(--mid-gray)' }}>
                            <X size={13} />
                          </button>
                        )}
                      </div>
                      {showBranch && (
                        <select value={branchValue} aria-label="Branch" className={CONTROL} style={CONTROL_STYLE}
                          onChange={e => { const v = e.target.value; setColPicks(f => ({ ...f, branch: v ? [v] : [] })) }}>
                          <option value="">All branches</option>
                          <option value="East Branch">East Branch</option>
                          <option value="Greenhills Branch">Greenhills Branch</option>
                        </select>
                      )}
                      {/* Replaces the old "Partner institutions only" checkbox —
                          that was the same question as "For prioritization" asked
                          twice, in two places, with two different names. Ticks
                          are OR-ed. */}
                      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Status">
                        {[
                          { key: 'converted',     label: 'Converted',          icon: UserCheck, tone: TONE.converted },
                          { key: 'not-converted', label: 'Not Converted',      icon: UserX,     tone: { bg: '#FDEAD6', fg: '#93460B', border: '#F6CFA8' } },
                          { key: 'priority',      label: 'For prioritization', icon: Star,      tone: TONE.partner },
                        ].map(o => {
                          const on = statusPicks.includes(o.key)
                          return (
                            <button key={o.key} type="button" aria-pressed={on}
                              onClick={() => setStatusPicks(p => on ? p.filter(x => x !== o.key) : [...p, o.key])}
                              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold transition-colors"
                              style={on
                                ? { background: o.tone.bg, color: o.tone.fg, border: `1px solid ${o.tone.border}` }
                                : { ...CONTROL_STYLE, color: 'var(--mid-gray)' }}>
                              <o.icon size={13} /> {o.label}
                            </button>
                          )
                        })}
                      </div>
                      {activeFilters > 0 && (
                        <button type="button" onClick={clearAll} className={`${BTN_SECONDARY} text-xs`} style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}>
                          <X size={12} /> Clear
                          <span className="ml-0.5 px-1.5 rounded-full text-[10.5px] tabular-nums" style={{ background: 'var(--teal)', color: '#fff' }}>{activeFilters}</span>
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                        Showing <strong style={{ color: 'var(--charcoal)' }}>{rows.length}</strong> of {total}
                      </span>
                      {showBranch && (
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          <span className={SECTION_LABEL} style={{ color: 'var(--mid-gray)' }}>By branch</span>
                          <CountChip label="East" n={stats.east} />
                          <CountChip label="Greenhills" n={stats.gh} />
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5">
                        <span className={SECTION_LABEL} style={{ color: 'var(--mid-gray)' }}>Attachments</span>
                        <CountChip label="With files" n={stats.files} />
                      </span>
                      <span className="text-[11px] ml-auto" style={{ color: 'var(--mid-gray)' }}>
                        Click a row for details · column headers sort, filter and resize
                      </span>
                    </div>
                  </div>

                  {/* ── List ── */}
                  <section className="rounded-xl overflow-hidden min-w-0" style={CARD_STYLE}>
                    <header className="px-5 py-3 flex flex-wrap items-center justify-between gap-2" style={{ borderBottom: '1px solid var(--light-gray)' }}>
                      <h2 className="text-[14px] font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                        {rows.length} response{rows.length === 1 ? '' : 's'}
                        {loading && <Loader2 size={13} className="animate-spin" style={{ color: 'var(--mid-gray)' }} />}
                      </h2>
                      <div className="flex flex-wrap items-center gap-3 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                        <LegendDot color={TONE.new.accent} label="New" />
                        <LegendDot color={TONE.converted.accent} label="Converted" />
                        <LegendDot color={TONE.partner.accent} label="For prioritization" />
                        <LegendDot color={TONE.both.accent} label="Converted priority" />
                      </div>
                    </header>
                  <div className="overflow-x-auto">
                    {/* table-layout: fixed is what makes resizing WORK. Under
                        the default `auto`, a width on a <th> is advisory —
                        the browser sizes columns from their content and
                        silently discards the drag, which is exactly how this
                        behaved: the cursor changed, the state updated, and
                        nothing moved. Fixed layout also needs a real total
                        width, so the table is sized from the columns and the
                        container scrolls. */}
                    <table className="text-sm" style={{ tableLayout: 'fixed', width: totalWidth, minWidth: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: SUBTLE_BG }}>
                          <th className={thClass} style={{ ...thStyle, width: W_NAME }}>Registrant</th>
                          <th className={thClass}
                            style={{ ...thStyle, width: wOf('submitted', 170), cursor: 'pointer' }}
                            onClick={() => toggleSort('submitted')} title="Sort by date submitted">
                            Submitted{sortMark('submitted')}
                            {filterInput('submitted')}
                            {resizeHandle('submitted', 170)}
                          </th>
                          {showBranch && (
                            <th className={thClass}
                              style={{ ...thStyle, width: wOf('branch', 130), cursor: 'pointer' }}
                              onClick={() => toggleSort('branch')} title="Sort by branch">
                              Branch{sortMark('branch')}
                              {filterInput('branch')}
                              {resizeHandle('branch', 130)}
                            </th>
                          )}
                          {displayCols.map((c: DisplayCol) => (
                            <th key={c.key}
                              className={thClass}
                              style={{
                                ...thStyle, cursor: 'pointer',
                                width: wOf(c.key, c.w),
                                // Wraps now: a fixed width plus nowrap would clip
                                // a long question title with no way to read it.
                                whiteSpace: 'normal',
                              }}
                              onClick={() => toggleSort(c.key)}
                              title={`${c.label} — click to sort`}>
                              {c.label}{sortMark(c.key)}
                              {filterInput(c.key)}
                              {resizeHandle(c.key, c.w)}
                            </th>
                          ))}
                          <th className={thClass} style={{ ...thStyle, width: W_ACTIONS }}><span className="sr-only">Actions</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((item, i) => {
                          const f = flags.get(item)!
                          // Converted AND from a partner institution is its own
                          // state, not a tie between green and yellow — it used
                          // to fall through to plain green, which hid that the
                          // row was also one to prioritise.
                          const tone = f.converted && f.partner ? TONE.both : f.converted ? TONE.converted : f.partner ? TONE.partner : f.isNew ? TONE.new : null
                          return (
                          <tr
                            key={item.landing_id || i}
                            data-row-id={item.landing_id}
                            onClick={() => setOpenId(item.landing_id)}
                            className="cursor-pointer align-top transition-colors hover:bg-[#F8FAF9]"
                            style={{
                              borderTop: '1px solid var(--light-gray)',
                              background: tone ? tone.row : undefined,
                              boxShadow: `inset 3px 0 0 ${tone ? tone.accent : 'transparent'}`,
                              opacity: deletingId === item.landing_id ? 0.55 : 1,
                            }}
                          >
                            <td className="px-3 py-2.5">
                              <p className="text-[13.5px] font-bold leading-snug truncate" style={{ color: f.name ? 'var(--charcoal)' : 'var(--mid-gray)' }} title={f.name || undefined}>
                                {f.name || 'No name given'}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                <StatusBadges converted={f.converted} partner={f.partner} isNew={f.isNew} />
                                <AttachmentIndicators files={f.files} />
                              </div>
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              {item.submitted_at ? (
                                <>
                                  <p className="text-[13px] tabular-nums" style={{ color: 'var(--charcoal)' }}>{fmtDay(item.submitted_at)}</p>
                                  <p className="text-[11px] flex items-center gap-1 mt-0.5 tabular-nums" style={{ color: 'var(--mid-gray)' }}>
                                    <Clock size={10} /> {fmtTime(item.submitted_at)} · {relTime(item.submitted_at)}
                                  </p>
                                </>
                              ) : <span style={{ color: 'var(--mid-gray)' }}>—</span>}
                            </td>
                            {showBranch && (
                              <td className="px-3 py-2.5">
                                <BranchBadge code={item._branch === 'SBEA' ? 'SBEA' : 'SBGH'} />
                              </td>
                            )}
                            {displayCols.map((c: DisplayCol) => {
                              const v = val(item, c.key)
                              return (
                                <td key={c.key} className="px-3 py-2.5 truncate text-[13px]" title={v} style={{ color: v ? 'var(--charcoal)' : 'var(--mid-gray)' }}>
                                  {v || '—'}
                                </td>
                              )
                            })}
                            <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center gap-1 justify-end">
                                <button onClick={() => setOpenId(item.landing_id)} className={BTN_ICON} style={CONTROL_STYLE} title="View details" aria-label="View details">
                                  <Eye size={13} style={{ color: 'var(--teal)' }} />
                                </button>
                                <button
                                  onClick={() => openEdit(item, results.fields)}
                                  className={BTN_ICON} style={CONTROL_STYLE}
                                  title="Edit" aria-label="Edit"
                                >
                                  <Pencil size={13} style={{ color: 'var(--teal)' }} />
                                </button>
                                <button
                                  onClick={() => handleDelete(item)}
                                  disabled={deletingId === item.landing_id}
                                  className={`${BTN_ICON} hover:!bg-red-50`} style={CONTROL_STYLE}
                                  title="Delete" aria-label="Delete"
                                >
                                  {deletingId === item.landing_id
                                    ? <Loader2 size={13} className="animate-spin" style={{ color: '#9CA3AF' }} />
                                    : <Trash2 size={13} style={{ color: '#DC2626' }} />}
                                </button>
                              </div>
                            </td>
                          </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {rows.length === 0 && (
                    <div className="flex flex-col items-center">
                      <SearchX size={26} className="mt-10 -mb-8" style={{ color: 'var(--light-gray)' }} />
                      <EmptyState title="No responses match these filters." hint="Try a different name or status, or clear the filters." />
                      <button type="button" onClick={clearAll}
                        className={`${BTN_SECONDARY} -mt-6 mb-8 text-xs`} style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}>
                        Clear filters
                      </button>
                    </div>
                  )}
                  </section>
                  </>
                  )
                })()}
            </>
          )}
        </>
      ) : (
        /* ── Form Cards Grid ──────────────────────────────────────── */
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[14px] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              Forms <span className="font-semibold tabular-nums" style={{ color: 'var(--mid-gray)' }}>· {visibleForms.length}</span>
            </h2>
            <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>Open a form for its QR, responses and settings</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleForms.map(form => (
              <button
                key={form.key}
                onClick={() => setSelectedForm(form)}
                className="group text-left rounded-xl p-5 flex flex-col min-w-0 transition-all hover:shadow-md hover:-translate-y-px"
                style={CARD_STYLE}
              >
                <div className="flex items-start gap-3 w-full">
                  <span className="w-10 h-10 flex-shrink-0 rounded-xl flex items-center justify-center" style={{ background: '#E6F1EE', color: 'var(--teal)' }}>
                    <FileText size={18} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-bold leading-snug" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                      {form.title}
                    </p>
                    {form.subtitle && (
                      <p className="text-xs mt-0.5 font-medium italic" style={{ color: 'var(--teal)' }}>
                        {form.subtitle}
                      </p>
                    )}
                  </div>
                  <ChevronRight size={16} className="mt-1 flex-shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--teal)' }} />
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-4">
                  <BranchBadge code="SBEA" />
                  {form.sbgh && <BranchBadge code="SBGH" />}
                  {form.comboSlug && form.sbgh && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold leading-4"
                      style={{ background: SUBTLE_BG, color: 'var(--charcoal)', border: '1px solid var(--light-gray)' }}>
                      <QrCode size={11} /> Both-branch QR
                    </span>
                  )}
                  {form.intro && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold leading-4"
                      style={{ background: '#F1F7F5', color: 'var(--teal)', border: '1px solid #CBE3DC' }}>
                      Lower fee available
                    </span>
                  )}
                </div>
                <div className="w-full mt-4 pt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold" style={{ borderTop: '1px solid var(--light-gray)', color: 'var(--mid-gray)' }}>
                  <span className="inline-flex items-center gap-1"><QrCode size={12} /> QR &amp; link</span>
                  <span className="inline-flex items-center gap-1"><BarChart3 size={12} /> Responses</span>
                  <span className="inline-flex items-center gap-1"><Settings size={12} /> Settings</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Detail side panel ─────────────────────────────────────── */}
      {opened && results && selectedForm && tab === 'results' && (() => {
        const name = getResponsePatientName(opened, results.fields)
        const key = name.toLowerCase().trim()
        return (
          <ResponseDetail
            item={opened}
            fields={results.fields}
            formTitle={selectedForm.title}
            showBranch={isAdmin && !!selectedForm.sbgh}
            name={name}
            converted={key !== '' && patientNames.has(key)}
            partner={isPartnerResponse(opened, partnerNames)}
            isNew={newCutoff && opened.submitted_at ? new Date(opened.submitted_at) > newCutoff : false}
            deleting={deletingId === opened.landing_id}
            onClose={() => setOpenId(null)}
            onEdit={() => openEdit(opened, results.fields)}
            onDelete={() => handleDelete(opened)}
          />
        )
      })()}

      {/* ── Edit Modal ──────────────────────────────────────────────── */}
      {editingItem && results && (
        <div className="fixed inset-0 flex items-center justify-center z-[60] p-4" style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(2px)' }}>
          <div role="dialog" aria-modal="true" aria-labelledby="regform-edit-title"
            className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden" style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div className="flex items-start justify-between gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--light-gray)' }}>
              <div className="min-w-0">
                <p className={SECTION_LABEL} style={{ color: 'var(--teal)' }}>Registration response</p>
                <h3 id="regform-edit-title" className="font-bold text-lg leading-snug mt-0.5" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>Edit Response</h3>
              </div>
              <button onClick={() => setEditingItem(null)} aria-label="Close"
                className="w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center hover:bg-gray-100" style={{ color: 'var(--mid-gray)' }}>
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3 overflow-y-auto min-h-0 flex-1">
              {results.fields.map((f: any) => (
                <div key={f.id}>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>
                    {f.title}
                  </label>
                  <input
                    className={`${CONTROL} w-full`}
                    style={CONTROL_STYLE}
                    value={editValues[f.id] || ''}
                    onChange={e => setEditValues(prev => ({ ...prev, [f.id]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 px-5 py-4" style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
              <button
                onClick={() => setEditingItem(null)}
                className={`${BTN_SECONDARY} flex-1`}
                style={CONTROL_STYLE}
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className={`${BTN_PRIMARY} flex-1`}
                style={{ background: saving ? '#9ca3af' : 'var(--teal)' }}
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Extract answer helper ────────────────────────────────────────────────────
// Extract patient full name from a form response's answers array.
// HR Platform stores names either as contact_info fields (a.contact.first_name/last_name)
// or as plain text answers whose field title contains "name" + "patient".
function getResponsePatientName(item: ResponseItem, fields: any[]): string {
  for (const a of (item.answers || [])) {
    if (a.contact) {
      return `${a.contact.first_name || ''} ${a.contact.last_name || ''}`.trim()
    }
  }
  for (const a of (item.answers || [])) {
    const field = fields.find((f: any) => f.id === a.field?.id)
    const title = (field?.title || '').toLowerCase()
    if ((title.includes('name') && title.includes('patient')) || title.includes('name of')) {
      if (a.text) return (a.text as string).trim()
    }
  }
  return ''
}

function extractAnswer(answer: any): string {
  if (!answer) return '—'
  switch (answer.type) {
    case 'text':         return answer.text || ''
    case 'email':        return answer.email || ''
    case 'number':       return String(answer.number ?? '')
    case 'boolean':      return answer.boolean ? 'Yes' : 'No'
    case 'date':         return answer.date ? answer.date.split('T')[0] : ''
    case 'choice':       return answer.choice ? (answer.choice.label || '') : ''
    case 'choices':      return answer.choices ? (answer.choices.labels || []).join(', ') : ''
    case 'phone_number': return answer.phone_number || ''
    case 'file_url':     return answer.file_url || answer.text || ''
    default:             return answer.text || answer.email || '—'
  }
}

// ── Presentation ─────────────────────────────────────────────────────────────
// Same control/button vocabulary as LOA Submission, Partner Institutions and
// Queueing, so the page reads as part of the same app. Display only — nothing
// below fetches, writes or changes what a response contains.

const CONTROL = 'h-9 px-3 rounded-lg text-sm outline-none focus:border-[var(--teal)]'
const CONTROL_STYLE: CSSProperties = { background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--charcoal)', fontFamily: 'var(--font-body)' }
const BTN_PRIMARY = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 whitespace-nowrap'
const BTN_SECONDARY = 'inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold transition-colors hover:bg-gray-50 disabled:opacity-60 whitespace-nowrap'
const BTN_ICON = 'inline-flex items-center justify-center gap-1 h-8 px-2 rounded-lg text-xs font-semibold transition-colors hover:bg-gray-50 disabled:opacity-50 cursor-pointer'
const SECTION_LABEL = 'text-[10.5px] font-bold uppercase tracking-wider'
const SUBTLE_BG = '#F6F9F8'

// Row states. Same hues the table always used (yellow = new, green =
// converted, amber = partner, violet = both) so nobody has to relearn them —
// just softer fills and a thin accent rule.
const TONE = {
  new:       { bg: '#FEF3C7', fg: '#854D0E', border: '#FDE68A', row: '#FFFDF3', accent: '#EAB308' },
  converted: { bg: '#DCFCE7', fg: '#166534', border: '#BBF7D0', row: '#F6FDF8', accent: '#16A34A' },
  partner:   { bg: '#FEF08A', fg: '#854D0E', border: '#FDE047', row: '#FFFBE6', accent: '#F59E0B' },
  both:      { bg: '#EDE9FE', fg: '#6D28D9', border: '#DDD6FE', row: '#F8F6FF', accent: '#7C3AED' },
}
const BRANCH_TONE: Record<'SBEA' | 'SBGH', { bg: string; fg: string; border: string; label: string }> = {
  SBEA: { bg: '#E6F1EE', fg: '#1F5F55', border: '#CBE3DC', label: 'East Branch' },
  SBGH: { bg: '#FDF3DC', fg: '#8A5A00', border: '#F3D9A5', label: 'Greenhills Branch' },
}

type Attachment = { title: string; url: string; kind: 'referral' | 'id' | 'file' }
type RowFlags = { name: string; converted: boolean; partner: boolean; isNew: boolean; files: Attachment[] }

function fmtDay(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
}
function fmtTime(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })
}
/** "just now" / "5m ago" / "3d ago". */
function relTime(iso: string) {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24); if (d < 14) return `${d}d ago`
  const w = Math.round(d / 7); if (d < 60) return `${w}w ago`
  const mo = Math.round(d / 30); if (mo < 12) return `${mo}mo ago`
  return `${Math.round(d / 365)}y ago`
}

/**
 * Uploaded files on a response — the photographed doctor's referral, the
 * PWD / Senior ID, anything else. A `file_url` answer, or any answer that is
 * just a link. Read through answerFor() so it sees the same answer the table
 * cell does.
 */
function attachmentsOf(item: ResponseItem, fields: any[]): Attachment[] {
  const out: Attachment[] = []
  for (const f of fields) {
    const ans = answerFor(item, f)
    if (!ans) continue
    const raw = String(ans.type === 'file_url' ? (ans.file_url || ans.text || '') : (ans.text || ''))
    const urls = raw.split(/[\s,]+/).filter(u => /^https?:\/\//i.test(u) || (ans.type === 'file_url' && u.startsWith('/')))
    if (!urls.length) continue
    const title = String(f.title ?? 'Attachment')
    const t = title.toLowerCase()
    const kind: Attachment['kind'] = /referr/.test(t) ? 'referral' : /pwd|senior|\bid\b|identification/.test(t) ? 'id' : 'file'
    for (const url of urls) out.push({ title, url, kind })
  }
  return out
}

function StatusBadges({ converted, partner, isNew }: { converted: boolean; partner: boolean; isNew: boolean }) {
  const chip = (tone: { bg: string; fg: string; border: string }, label: string, title?: string) => (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide leading-3 whitespace-nowrap"
      style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}` }} title={title}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: tone.fg }} />
      {label}
    </span>
  )
  return (
    <>
      {isNew && chip(TONE.new, 'New', 'Submitted since notifications were last cleared')}
      {converted && partner
        ? chip(TONE.both, 'Converted Priority', 'Already a patient, and from a partner institution')
        : <>
            {converted && chip(TONE.converted, 'Converted', 'This name is already in Patient CRM')}
            {partner && chip(TONE.partner, 'For prioritization', 'Registrant is from a partner institution')}
          </>}
    </>
  )
}

function AttachmentIndicators({ files }: { files: Attachment[] }) {
  if (!files.length) return null
  const referral = files.some(f => f.kind === 'referral')
  const id = files.some(f => f.kind === 'id')
  const other = files.filter(f => f.kind === 'file').length
  const pill = (icon: ReactNode, label: string, title: string) => (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold leading-3 whitespace-nowrap"
      style={{ background: '#E3EEFB', color: '#14507F', border: '1px solid #BED6F2' }} title={title}>
      {icon}{label}
    </span>
  )
  return (
    <>
      {referral && pill(<FileImage size={10} />, 'Referral', "Doctor's referral attached")}
      {id && pill(<IdCard size={10} />, 'ID', 'PWD / Senior ID attached')}
      {other > 0 && pill(<Paperclip size={10} />, String(other), `${other} other file${other === 1 ? '' : 's'} attached`)}
    </>
  )
}

function BranchBadge({ code }: { code: 'SBEA' | 'SBGH' }) {
  const t = BRANCH_TONE[code]
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold leading-4 whitespace-nowrap"
      style={{ background: t.bg, color: t.fg, border: `1px solid ${t.border}` }}>
      <Building2 size={11} /> {t.label}
    </span>
  )
}

function QrBranchBadge({ branch, label }: { branch: 'SBEA' | 'SBGH' | 'BOTH'; label: string }) {
  if (branch !== 'BOTH') return <BranchBadge code={branch} />
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold leading-4"
      style={{ background: SUBTLE_BG, color: 'var(--charcoal)', border: '1px solid var(--light-gray)' }}>
      <Building2 size={11} /> {label}
    </span>
  )
}

function CountChip({ label, n }: { label: string; n: number }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold leading-4"
      style={{ background: SUBTLE_BG, color: 'var(--charcoal)', border: '1px solid var(--light-gray)' }}>
      {label} <span className="tabular-nums" style={{ color: 'var(--teal)' }}>{n}</span>
    </span>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />{label}
    </span>
  )
}

function ResultsSkeleton() {
  return (
    <div className="space-y-5" aria-hidden>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, n) => (
          <div key={n} className="rounded-xl px-4 py-3.5" style={CARD_STYLE}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-14 mt-2" />
            <Skeleton className="h-3 w-24 mt-2" />
          </div>
        ))}
      </div>
      <div className="rounded-xl px-4 py-3 flex gap-2" style={CARD_STYLE}>
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-56" />
      </div>
      <div className="rounded-xl overflow-hidden" style={CARD_STYLE}>
        {Array.from({ length: 6 }).map((_, n) => (
          <div key={n} className="flex items-center gap-5 px-5 py-4" style={{ borderTop: n ? '1px solid var(--light-gray)' : undefined }}>
            <div className="w-52"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-24 mt-2" /></div>
            <div className="w-32"><Skeleton className="h-4 w-24" /><Skeleton className="h-3 w-16 mt-2" /></div>
            <Skeleton className="h-5 w-28 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Detail side panel ────────────────────────────────────────────────────────
// A read of one response, grouped so the front desk can scan it. The groups
// come from each question's title — the forms differ per branch and per form,
// so there is no fixed schema to lean on; anything that doesn't fit lands in
// "Other answers" rather than being hidden.

type DetailGroup = 'patient' | 'contact' | 'guardian' | 'medical' | 'consent' | 'other'
const DETAIL_GROUPS: Array<{ key: DetailGroup; title: string; icon: ReactNode }> = [
  { key: 'patient',  title: 'Patient',            icon: <User size={12} /> },
  { key: 'contact',  title: 'Contact',            icon: <Phone size={12} /> },
  { key: 'guardian', title: 'Guardian',           icon: <Users size={12} /> },
  { key: 'medical',  title: 'Medical / Referral', icon: <Stethoscope size={12} /> },
  { key: 'consent',  title: 'Consent',            icon: <ShieldCheck size={12} /> },
  { key: 'other',    title: 'Other answers',      icon: <ListChecks size={12} /> },
]

function groupOf(title: string): DetailGroup {
  const t = title.toLowerCase()
  if (/consent|agree|privacy|terms|acknowledg|certif|signature|waiver|authori[sz]/.test(t)) return 'consent'
  if (/guardian|parent|mother|father|relationship|emergency|informant|companion|spouse/.test(t)) return 'guardian'
  if (/referr|diagnos|doctor|physician|medical|condition|concern|complaint|service|therap|hmo|insurance|school|partner|institution|pwd|senior|medication|allerg|history|developmental|department/.test(t)) return 'medical'
  if (/phone|mobile|email|e-mail|contact|address|city|barangay|province|facebook|messenger|viber/.test(t)) return 'contact'
  if (/name|birth|age|sex|gender|patient|child|nickname|nationality|religion|civil|occupation|grade|weight|height/.test(t)) return 'patient'
  return 'other'
}

function ResponseDetail({
  item, fields, formTitle, showBranch, name, converted, partner, isNew, deleting, onClose, onEdit, onDelete,
}: {
  item: ResponseItem; fields: any[]; formTitle: string; showBranch: boolean; name: string
  converted: boolean; partner: boolean; isNew: boolean; deleting: boolean
  onClose: () => void; onEdit: () => void; onDelete: () => void
}) {
  const files = attachmentsOf(item, fields)
  const fileTitles = new Set(files.map(f => f.title))
  const groups: Record<DetailGroup, Array<{ label: string; value: string }>> = {
    patient: [], contact: [], guardian: [], medical: [], consent: [], other: [],
  }
  let unanswered = 0
  for (const f of fields) {
    const title = String(f.title ?? '')
    if (fileTitles.has(title)) continue
    const ans = answerFor(item, f)
    const c = ans?.contact
    if (c) {
      // A contact question is name + phone + email in one answer; show the
      // parts, filed under Guardian when the question is about a parent.
      const g = groupOf(title) === 'guardian' ? 'guardian' : 'contact'
      const nm = `${c.first_name ?? ''} ${c.last_name ?? ''}`.replace(/\s+/g, ' ').trim()
      if (nm) groups[g].push({ label: `${title} — Name`, value: nm })
      if (c.phone_number) groups[g].push({ label: `${title} — Phone`, value: c.phone_number })
      if (c.email) groups[g].push({ label: `${title} — Email`, value: c.email })
      continue
    }
    const v = extractAnswer(ans)
    if (!v || v === '—') { unanswered++; continue }
    groups[groupOf(title)].push({ label: title, value: v })
  }
  const branch: 'SBEA' | 'SBGH' = item._branch === 'SBGH' ? 'SBGH' : 'SBEA'

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(15,23,42,0.35)', backdropFilter: 'blur(2px)' }} onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-labelledby="regform-detail-title"
        className="bg-white h-full w-full max-w-[480px] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <p className={SECTION_LABEL} style={{ color: 'var(--teal)' }}>{formTitle}</p>
            <h3 id="regform-detail-title" className="text-lg font-bold leading-snug mt-0.5 break-words" style={{ fontFamily: 'var(--font-display)', color: name ? 'var(--charcoal)' : 'var(--mid-gray)' }}>
              {name || 'No name given'}
            </h3>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <StatusBadges converted={converted} partner={partner} isNew={isNew} />
              {showBranch && <BranchBadge code={branch} />}
            </div>
            {item.submitted_at && (
              <p className="text-[11.5px] mt-1.5 flex items-center gap-1" style={{ color: 'var(--mid-gray)' }}>
                <Clock size={11} /> Submitted {fmtDay(item.submitted_at)}, {fmtTime(item.submitted_at)} · {relTime(item.submitted_at)}
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" autoFocus
            className="w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center hover:bg-gray-100" style={{ color: 'var(--mid-gray)' }}>
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto min-h-0 flex-1">
          {/* Patient CRM status — what the front desk acts on */}
          <section className="px-5 pb-4">
            <div className="rounded-lg px-3 py-2.5 flex items-start gap-2.5"
              style={{ background: converted ? '#F1F7F5' : '#FFF7E6', border: `1px solid ${converted ? '#CBE3DC' : '#F3D9A5'}` }}>
              {converted
                ? <UserCheck size={15} className="flex-shrink-0 mt-0.5" style={{ color: '#1F5F55' }} />
                : <UserX size={15} className="flex-shrink-0 mt-0.5" style={{ color: '#8A5A00' }} />}
              <p className="text-[12.5px] leading-snug m-0" style={{ color: converted ? '#1F5F55' : '#8A5A00' }}>
                {converted
                  ? 'Converted — a patient with this name is already in Patient CRM.'
                  : name ? 'Not converted — no patient with this name in Patient CRM yet.' : 'No patient name on this response to match against Patient CRM.'}
                {partner && <><br /><strong>From a partner institution</strong> — schedule first.</>}
              </p>
            </div>
          </section>

          {DETAIL_GROUPS.filter(g => g.key !== 'consent' && g.key !== 'other').map(g => groups[g.key].length > 0 && (
            <DetailSection key={g.key} icon={g.icon} title={g.title}>
              <DetailList rows={groups[g.key]} />
            </DetailSection>
          ))}

          <DetailSection icon={<Paperclip size={12} />} title={`Attachments${files.length ? ` · ${files.length}` : ''}`}>
            {files.length ? (
              <div className="grid gap-2.5">
                {files.map((a, n) => <AttachmentTile key={`${a.url}-${n}`} a={a} />)}
              </div>
            ) : (
              <div className="rounded-lg px-3 py-3 text-center" style={{ border: '1px dashed var(--light-gray)' }}>
                <Paperclip size={15} className="mx-auto mb-1" style={{ color: 'var(--mid-gray)' }} />
                <p className="text-[12.5px] font-semibold" style={{ color: 'var(--charcoal)' }}>No files on this response</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>No referral or PWD / Senior ID was uploaded.</p>
              </div>
            )}
          </DetailSection>

          {DETAIL_GROUPS.filter(g => g.key === 'consent' || g.key === 'other').map(g => groups[g.key].length > 0 && (
            <DetailSection key={g.key} icon={g.icon} title={g.title}>
              <DetailList rows={groups[g.key]} />
            </DetailSection>
          ))}

          {unanswered > 0 && (
            <p className="px-5 pb-5 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
              {unanswered} question{unanswered === 1 ? '' : 's'} left blank — not shown.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 px-5 py-3" style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
          <button onClick={onEdit} className={BTN_PRIMARY} style={{ background: 'var(--teal)' }}>
            <Pencil size={14} /> Edit response
          </button>
          <div className="flex-1" />
          <button onClick={onDelete} disabled={deleting} className={BTN_SECONDARY} style={{ ...CONTROL_STYLE, color: '#B42318' }}>
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
          </button>
        </div>
      </aside>
    </div>
  )
}

function DetailSection({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="px-5 py-4" style={{ borderTop: '1px solid var(--light-gray)' }}>
      <h4 className={`flex items-center gap-1.5 mb-2.5 ${SECTION_LABEL}`} style={{ color: 'var(--mid-gray)' }}>
        <span style={{ color: 'var(--teal)' }}>{icon}</span>{title}
      </h4>
      {children}
    </section>
  )
}

function DetailList({ rows }: { rows: Array<{ label: string; value: string }> }) {
  return (
    <dl className="space-y-2">
      {rows.map((r, n) => (
        <div key={`${r.label}-${n}`} className="min-w-0">
          <dt className="text-[11.5px] leading-snug" style={{ color: 'var(--mid-gray)' }}>{r.label}</dt>
          <dd className="text-[13px] leading-snug mt-0.5 break-words whitespace-pre-line" style={{ color: 'var(--charcoal)' }}>{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** One uploaded file: an inline preview when it is a picture, a link either way. */
function AttachmentTile({ a }: { a: Attachment }) {
  const [broken, setBroken] = useState(false)
  const isDoc = /\.(pdf|docx?|xlsx?|pptx?)(\?|#|$)/i.test(a.url)
  const Icon = a.kind === 'referral' ? FileImage : a.kind === 'id' ? IdCard : Paperclip
  return (
    <div className="rounded-lg overflow-hidden min-w-0" style={{ border: '1px solid var(--light-gray)' }}>
      {!isDoc && !broken ? (
        <a href={a.url} target="_blank" rel="noopener noreferrer" className="block" style={{ background: SUBTLE_BG }} title="Open in a new tab">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.url} alt={a.title} loading="lazy" onError={() => setBroken(true)}
            className="w-full max-h-[240px] object-contain" />
        </a>
      ) : (
        <div className="flex items-center justify-center gap-2 py-5 text-[11.5px]" style={{ background: SUBTLE_BG, color: 'var(--mid-gray)' }}>
          <Icon size={16} /> {isDoc ? 'Document' : 'Preview not available'}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 px-3 py-2" style={{ borderTop: '1px solid var(--light-gray)' }}>
        <span className="inline-flex items-center gap-1.5 min-w-0 text-[12px] font-semibold" style={{ color: 'var(--charcoal)' }}>
          <Icon size={13} className="flex-shrink-0" style={{ color: '#14507F' }} />
          <span className="truncate" title={a.title}>{a.title}</span>
        </span>
        <a href={a.url} target="_blank" rel="noopener noreferrer" className={BTN_ICON} style={{ ...CONTROL_STYLE, color: '#14507F' }}>
          <ExternalLink size={12} /> Open
        </a>
      </div>
    </div>
  )
}


// ── Service departments settings ─────────────────────────────────────────────
// Controls which departments appear on the form's "What service does the
// patient need" question, per branch (each branch is a separate form in the HR
// Platform). Toggling here never edits the form definition itself — the HR
// Platform keeps an overlay, so a disabled department is hidden rather than
// deleted and can be switched back on at any time.
// Partner institutions for this form's "Are you from one of our partner
// institutions?" question. Unlike services — which toggle choices the form
// definition already ships — partners are added, renamed and removed, so this
// is a full-list editor.
//
// Each branch's form holds its own list, so the branch toggle above changes
// which one is edited. "None (not from a partner institution)" is managed by
// the HR Platform and never appears here; it cannot be removed by accident.
function PartnerInstitutionsSettings({ formId, branchLabel, canEdit }: {
  formId: string
  branchLabel: string
  canEdit: boolean
}) {
  const [names, setNames] = useState<string[]>([])
  const [saved, setSaved] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [unavailable, setUnavailable] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setMsg(null); setUnavailable(null)
    fetch(`/api/registration-forms/${formId}/partner-options`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        if (d?.ok) { setNames(d.names || []); setSaved(d.names || []) }
        // A form without the question isn't an error worth shouting about —
        // most forms don't have one. Hide the section instead.
        else setUnavailable(d?.error || 'Not available for this form.')
      })
      .catch(() => { if (!cancelled) setUnavailable('Could not reach the form service.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [formId])

  const dirty = names.length !== saved.length || names.some((n, i) => n !== saved[i])

  async function save() {
    if (!canEdit || saving) return
    const cleaned = names.map(n => n.trim()).filter(Boolean)
    // Case-insensitive duplicates would render as the same choice twice.
    const dupe = cleaned.find((n, i) => cleaned.findIndex(m => m.toLowerCase() === n.toLowerCase()) !== i)
    if (dupe) { setMsg({ kind: 'err', text: `"${dupe}" is listed twice.` }); return }

    setSaving(true); setMsg(null)
    try {
      const r = await fetch(`/api/registration-forms/${formId}/partner-options`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: cleaned }),
      })
      const d = await r.json()
      if (!r.ok || !d?.ok) throw new Error(d?.error || 'Save failed')
      setNames(d.names || cleaned); setSaved(d.names || cleaned)
      setMsg({ kind: 'ok', text: 'Saved — the public form updates immediately.' })
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message })
    } finally { setSaving(false) }
  }

  if (unavailable) return null

  const header = (
    <header className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--light-gray)' }}>
      <h2 className="flex items-center gap-2 text-[14px] font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
        <Star size={15} style={{ color: 'var(--teal)' }} /> Partner institutions — {branchLabel}
      </h2>
      <p className="text-xs mt-1 leading-snug" style={{ color: 'var(--mid-gray)' }}>
        The choices under “Are you from one of our partner institutions?”. Registrations from
        these institutions are flagged <strong>For prioritization</strong> in the Responses tab.
        “None” is always offered and isn’t listed here.
      </p>
    </header>
  )

  if (loading) return (
    <section className="rounded-xl min-w-0 overflow-hidden" style={CARD_STYLE} aria-busy>
      {header}
      <div className="p-5 space-y-2" aria-hidden>
        {Array.from({ length: 4 }).map((_, n) => <Skeleton key={n} className="h-9 w-full" />)}
      </div>
    </section>
  )

  return (
    <section className="rounded-xl min-w-0 overflow-hidden" style={CARD_STYLE}>
      {header}
      <div className="p-5 space-y-2">
        {names.map((n, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className={`${CONTROL} w-full min-w-0 disabled:opacity-70`}
              style={CONTROL_STYLE}
              value={n}
              disabled={!canEdit || saving}
              placeholder="Institution name"
              onChange={e => setNames(names.map((v, j) => (j === i ? e.target.value : v)))}
            />
            {canEdit && (
              <button type="button" onClick={() => setNames(names.filter((_, j) => j !== i))}
                disabled={saving}
                className="w-9 h-9 flex-shrink-0 rounded-lg inline-flex items-center justify-center transition-colors hover:bg-red-50 disabled:opacity-50"
                title="Remove" aria-label="Remove"
                style={{ ...CONTROL_STYLE, color: '#DC2626' }}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
        {names.length === 0 && (
          <div className="rounded-lg px-3 py-4 text-center" style={{ border: '1px dashed var(--light-gray)' }}>
            <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
              No partner institutions — the question will show “None” only.
            </p>
          </div>
        )}
      </div>

      {(canEdit || msg) && (
        <div className="flex flex-wrap items-center gap-2 px-5 py-3" style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
          {canEdit && (
            <>
              <button type="button" onClick={() => setNames([...names, ''])} disabled={saving}
                className={`${BTN_SECONDARY} text-xs`} style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}>
                <Plus size={13} /> Add institution
              </button>
              <div className="flex-1" />
              {dirty && !saving && (
                <button type="button" onClick={() => { setNames(saved); setMsg(null) }}
                  className={`${BTN_SECONDARY} text-xs`} style={{ color: 'var(--mid-gray)' }}>
                  Cancel
                </button>
              )}
              <button type="button" onClick={save} disabled={saving || !dirty}
                className={`${BTN_PRIMARY} text-xs`}
                style={{ background: dirty ? 'var(--teal)' : '#9ca3af' }}>
                {saving && <Loader2 size={13} className="animate-spin" />}
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </>
          )}
          {msg && (
            <p role={msg.kind === 'err' ? 'alert' : 'status'} className="w-full text-xs m-0 flex items-center gap-1.5" style={{ color: msg.kind === 'ok' ? '#15803d' : '#dc2626' }}>
              {msg.kind === 'ok' ? <Check size={12} /> : <AlertTriangle size={12} />} {msg.text}
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function ServiceOptionsSettings({
  formId, branchLabel, canEdit, showBranchToggle, qrBranch, onBranchChange,
}: {
  formId: string
  branchLabel: string
  canEdit: boolean
  showBranchToggle: boolean
  qrBranch: 'SBEA' | 'SBGH'
  onBranchChange: (b: 'SBEA' | 'SBGH') => void
}) {
  const [all, setAll] = useState<string[]>([])
  const [enabled, setEnabled] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setMsg(null)
    fetch(`/api/registration-forms/${formId}/service-options`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        if (d?.ok) { setAll(d.all || []); setEnabled(d.enabled || []) }
        else setMsg({ kind: 'err', text: d?.error || 'Could not load settings.' })
      })
      .catch(() => { if (!cancelled) setMsg({ kind: 'err', text: 'Could not reach the form service.' }) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [formId])

  async function toggle(label: string) {
    if (!canEdit || saving) return
    const next = enabled.includes(label) ? enabled.filter(l => l !== label) : [...enabled, label]
    // A form whose only question has no options can't be submitted at all.
    if (next.length === 0) {
      setMsg({ kind: 'err', text: 'At least one service must stay enabled.' })
      return
    }
    const prev = enabled
    setEnabled(next); setSaving(true); setMsg(null)
    try {
      const r = await fetch(`/api/registration-forms/${formId}/service-options`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      })
      const d = await r.json()
      if (!r.ok || !d?.ok) throw new Error(d?.error || 'Save failed')
      setMsg({ kind: 'ok', text: 'Saved — the public form updates immediately.' })
    } catch (e) {
      setEnabled(prev)   // roll back so the UI never claims a save that didn't happen
      setMsg({ kind: 'err', text: (e as Error).message })
    } finally { setSaving(false) }
  }

  return (
    <section className="rounded-xl min-w-0 overflow-hidden" style={CARD_STYLE}>
      <header className="px-5 pt-4 pb-3 space-y-3" style={{ borderBottom: '1px solid var(--light-gray)' }}>
        <div>
          <h2 className="flex items-center gap-2 text-[14px] font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            <ListChecks size={15} style={{ color: 'var(--teal)' }} /> Services offered — {branchLabel}
          </h2>
          <p className="text-xs mt-1 leading-snug" style={{ color: 'var(--mid-gray)' }}>
            Controls the options patients see under “What service does the patient need”.
            Turning one off hides it from the public form immediately; it is not deleted and can be switched back on.
          </p>
        </div>
        {showBranchToggle && (
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
            {(['SBEA', 'SBGH'] as const).map(b => (
              <button
                key={b}
                onClick={() => onBranchChange(b)}
                className="h-8 px-4 rounded-lg text-sm font-semibold transition-all flex-1"
                style={qrBranch === b ? { background: 'var(--teal)', color: '#fff' } : { color: 'var(--mid-gray)' }}
              >
                {b === 'SBEA' ? 'East Branch' : 'Greenhills Branch'}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="p-5">
        {loading ? (
          <div className="space-y-2" aria-hidden>
            {Array.from({ length: 5 }).map((_, n) => <Skeleton key={n} className="h-11 w-full" />)}
          </div>
        ) : all.length === 0 ? (
          <EmptyState title="No service question" hint="This form has no service question to configure." />
        ) : (
          <div className="flex flex-col gap-2">
            {all.map(label => {
              const on = enabled.includes(label)
              return (
                <button
                  key={label}
                  role="switch"
                  aria-checked={on}
                  onClick={() => toggle(label)}
                  disabled={!canEdit || saving}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium text-left transition-colors"
                  style={{
                    border: `1px solid ${on ? '#CBE3DC' : 'var(--light-gray)'}`,
                    background: on ? '#F1F7F5' : '#fff',
                    color: on ? 'var(--charcoal)' : 'var(--mid-gray)',
                    cursor: canEdit && !saving ? 'pointer' : 'not-allowed',
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  <span className="min-w-0">{label}</span>
                  <span className="inline-flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: on ? 'var(--teal)' : '#9ca3af' }}>
                      {on ? 'On' : 'Off'}
                    </span>
                    <span aria-hidden className="relative inline-block w-9 h-5 rounded-full transition-colors" style={{ background: on ? 'var(--teal)' : '#D1D5DB' }}>
                      <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: on ? 18 : 2, boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} />
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {(!canEdit || msg) && (
        <div className="px-5 py-3 space-y-1" style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
          {!canEdit && (
            <p className="text-xs m-0 flex items-center gap-1.5" style={{ color: 'var(--mid-gray)' }}>
              <Info size={12} /> Read-only — an admin account is required to change these.
            </p>
          )}
          {msg && (
            <p role={msg.kind === 'err' ? 'alert' : 'status'} className="text-xs m-0 flex items-center gap-1.5" style={{ color: msg.kind === 'ok' ? 'var(--teal)' : '#dc2626' }}>
              {msg.kind === 'ok' ? <Check size={12} /> : <AlertTriangle size={12} />} {msg.text}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
