'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  FileText,
  Loader2,
  Search,
  X,
  Download,
  ExternalLink,
  ClipboardList,
  Eye,
  Pin,
} from 'lucide-react'
import { ErrorCard, FOCUS, PAGE } from '@/components/hub/ui'

interface Template {
  id: string
  templateNo: string
  templateName: string
  department: string
  description: string
  versionNumber: string
  compilation: string
  templateSize: string
  internalOnly: boolean
  pinned: boolean
  docxUrl: string
  pdfUrl: string
  link: string
  formLink: string
}
interface StdTest {
  id: string
  name: string
  department: string
  pdfUrl: string
}
interface ApiResponse {
  department: string | null
  allowedDepts: string[] | null
  isAdmin: boolean
  templates: Template[]
  standardizedTests: StdTest[]
}

// Filter is a category ('all'/'pinned'/'technical'/'admin'/'hr') OR a specific
// technical-department name (e.g. 'OT', 'Psychology') when the viewer sees all
// departments (admin / front-desk / administration staff) and gets per-dept tabs.
type Filter = string

// Preferred tab order + short labels for the per-department tabs.
const TECH_DEPT_ORDER = ['OT', 'SLP', 'PT', 'SPED', 'MD', 'Orthosis & Prosthesis', 'Psychology']
const DEPT_TAB_LABEL: Record<string, string> = { 'Orthosis & Prosthesis': 'Orthosis' }

/* Accounting Hub list look (see accounting-hub official-documents): white
   bordered card, light toolbar, uppercase table header, thin row lines. */
const C = {
  line: '#DDE6CC', rowLine: '#E9EFDC', head: '#f8faf6', bar: '#fcfdfa',
  text: '#233038', muted: '#55616A', faint: '#8A9AA0', teal: '#4A8073', deep: '#3C6A5F', pale: '#EDF3D9',
  amber: '#B7791F', amberBg: '#FBF4E4',
}
const TH = 'text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-[.4px] whitespace-nowrap'
/* One size for every file button, so rows line up whatever mix they have. */
const FILE_BTN = 'inline-flex items-center justify-center gap-1.5 h-7 w-full px-2 rounded-lg border bg-white text-[11.5px] font-semibold whitespace-nowrap transition-colors hover:bg-[#EDF3D9]'

export default function TemplatesPage() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => { fetchTemplates() }, [])

  async function fetchTemplates() {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/templates', { cache: 'no-store' })
      if (res.ok) {
        setData(await res.json())
      } else {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? `Could not load templates (${res.status})`)
      }
    } catch (err) {
      setError((err as Error).message || 'Could not load templates')
    }
    setLoading(false)
  }

  // Active filter applied on top of the API's already-scoped list.
  // The API returns only what this clinician is allowed to see; the
  // filter buttons just narrow that further by category.
  // Optimistic pin state — keeps the UI snappy while the server update
  // is in flight; reconciled on the next fetch.
  const [pinningId, setPinningId] = useState<string | null>(null)
  const [optimisticPins, setOptimisticPins] = useState<Record<string, boolean>>({})

  async function togglePin(t: Template) {
    const currently = optimisticPins[t.id] ?? t.pinned
    const next = !currently
    setOptimisticPins((m) => ({ ...m, [t.id]: next }))
    setPinningId(t.id)
    try {
      const res = await fetch(`/api/templates/${t.id}/pin`, {
        method: next ? 'POST' : 'DELETE',
      })
      if (!res.ok) {
        // Roll back on failure.
        setOptimisticPins((m) => ({ ...m, [t.id]: !next }))
      }
    } catch {
      setOptimisticPins((m) => ({ ...m, [t.id]: !next }))
    }
    setPinningId(null)
  }
  function isPinned(t: Template): boolean {
    return optimisticPins[t.id] ?? t.pinned
  }

  // Category filter, shared by the list and the tab counts.
  function inCategory(t: Template, f: Filter): boolean {
    if (!data) return false
    if (f === 'all') return true
    if (f === 'pinned') return optimisticPins[t.id] ?? t.pinned
    if (f === 'technical') return data.department ? t.department === data.department : true
    if (f === 'admin') return t.department === 'Admin/Operations'
    if (f === 'hr') return t.department === 'HR'
    return t.department === f
  }
  function testInCategory(t: StdTest, f: Filter): boolean {
    if (!data) return false
    if (f === 'pinned' || f === 'admin' || f === 'hr') return false
    if (f === 'all') return true
    if (f === 'technical') return data.department ? t.department === data.department : true
    return t.department === f
  }

  const visibleTemplates = useMemo(() => {
    if (!data) return []
    let list = data.templates
    if (filter === 'pinned') {
      list = list.filter((t) => optimisticPins[t.id] ?? t.pinned)
    } else if (filter === 'technical') {
      // The clinician's own department (the "technical" one).
      const ownDept = data.department
      list = ownDept ? list.filter((t) => t.department === ownDept) : list
    } else if (filter === 'admin') {
      list = list.filter((t) => t.department === 'Admin/Operations')
    } else if (filter === 'hr') {
      list = list.filter((t) => t.department === 'HR')
    } else if (filter !== 'all') {
      // A specific technical-department tab (e.g. 'OT', 'Psychology').
      list = list.filter((t) => t.department === filter)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((t) =>
        (t.templateName + ' ' + t.templateNo + ' ' + t.description + ' ' + t.department)
          .toLowerCase()
          .includes(q),
      )
    }
    return list
  }, [data, filter, search])

  const visibleTests = useMemo(() => {
    if (!data) return []
    // Standardized tests aren't pinned individually and have no HR/Admin items.
    if (filter === 'pinned' || filter === 'admin' || filter === 'hr') return []
    let tests = data.standardizedTests
    if (filter === 'technical' && data.department) {
      tests = tests.filter((t) => t.department === data.department)
    } else if (filter !== 'all') {
      // A specific technical-department tab.
      tests = tests.filter((t) => t.department === filter)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      tests = tests.filter((t) => (t.name + ' ' + t.department).toLowerCase().includes(q))
    }
    return tests
  }, [data, filter, search])

  // Viewers who see all departments (admin / front-desk / administration staff)
  // get one tab per technical department. Derived from the data so it only shows
  // departments that actually have forms; HR + Admin/Operations have their own tabs.
  const seesAllDepts = data?.allowedDepts === null
  const techDepts = useMemo(() => {
    if (!data) return []
    const set = new Set<string>()
    data.templates.forEach((t) => set.add(t.department))
    data.standardizedTests.forEach((t) => set.add(t.department))
    set.delete('HR'); set.delete('Admin/Operations')
    return [...set].sort((a, b) => {
      const ia = TECH_DEPT_ORDER.indexOf(a), ib = TECH_DEPT_ORDER.indexOf(b)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })
  }, [data])

  // Group templates by department for nicer display.
  const grouped = useMemo(() => {
    const m = new Map<string, Template[]>()
    for (const t of visibleTemplates) {
      const arr = m.get(t.department) ?? []
      arr.push(t)
      m.set(t.department, arr)
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [visibleTemplates])

  const totalCount = visibleTemplates.length + visibleTests.length

  const tabDefs: { id: string; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'pinned', label: 'Pinned' },
    ...(seesAllDepts
      ? techDepts.map((d) => ({ id: d, label: DEPT_TAB_LABEL[d] ?? d }))
      : [{ id: 'technical', label: data?.department ? `My department (${data.department})` : 'My department' }]),
    { id: 'admin', label: 'Admin/Operations' },
    { id: 'hr', label: 'HR' },
  ]
  const tabCount = (f: Filter) =>
    data ? data.templates.filter((t) => inCategory(t, f)).length + data.standardizedTests.filter((t) => testInCategory(t, f)).length : 0
  const onlineCount = visibleTemplates.filter((t) => (t.formLink || t.link) && !t.internalOnly).length

  return (
    <div className={`${PAGE} !max-w-[1100px]`}>
      {/* Header — Accounting Hub style: icon title + one-line description. */}
      <div className="min-w-0">
        <h1 className="text-2xl font-bold leading-tight flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: C.text }}>
          <FileText size={22} style={{ color: C.teal }} aria-hidden /> Templates &amp; Forms
        </h1>
        <p className="mt-1 text-[13px] max-w-3xl" style={{ color: C.muted }}>
          Operational forms, clinical templates and standardized tests for your department. Pin the ones you use most.
        </p>
      </div>

      {/* Category tabs — underline style with counts */}
      <div className="border-b-2" style={{ borderColor: C.line }}>
        <div className="flex items-end gap-1 -mb-[2px] max-w-full overflow-x-auto" role="tablist" aria-label="Template category">
          {tabDefs.map((tb) => {
            const on = filter === tb.id
            const n = tabCount(tb.id)
            return (
              <button key={tb.id} type="button" role="tab" aria-selected={on} onClick={() => setFilter(tb.id)}
                className={`px-3.5 py-2.5 text-[13px] font-semibold border-b-2 whitespace-nowrap transition-colors hover:text-[#4A8073] flex items-center gap-1.5 ${FOCUS}`}
                style={{ fontFamily: 'var(--font-display)', borderColor: on ? C.teal : 'transparent', color: on ? C.teal : C.muted }}>
                {tb.id === 'pinned' && <Pin size={12} aria-hidden />}
                {tb.label}
                {!loading && !!n && (
                  <span className="px-1.5 rounded-full text-[11px] font-bold" style={{ background: on ? C.pale : '#f1f5f2', color: on ? C.deep : C.muted }}>{n}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {error ? (
        <ErrorCard title="Could not load templates" hint={error} onRetry={fetchTemplates} />
      ) : (
        <div className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: C.line }}>
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b" style={{ background: C.bar, borderColor: C.line }}>
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: C.faint }} aria-hidden />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, number or description…" aria-label="Search templates"
                className="w-full h-8 pl-8 pr-8 rounded-lg border text-xs bg-white focus:outline-none focus:border-[#4A8073]" style={{ borderColor: C.line, color: C.text }} />
              {search && (
                <button type="button" onClick={() => setSearch('')} aria-label="Clear search" title="Clear search"
                  className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center hover:bg-[#EDF3D9] ${FOCUS}`} style={{ color: C.muted }}>
                  <X size={13} />
                </button>
              )}
            </div>
            {!loading && data && (
              <span className="text-xs" style={{ color: C.muted }}>
                {visibleTemplates.length} template{visibleTemplates.length === 1 ? '' : 's'}
                {visibleTests.length > 0 && <> · {visibleTests.length} test{visibleTests.length === 1 ? '' : 's'}</>}
                {onlineCount > 0 && <> · {onlineCount} online form{onlineCount === 1 ? '' : 's'}</>}
              </span>
            )}
          </div>

          {loading ? (
            <div className="p-4 space-y-2" role="status" aria-label="Loading templates">
              {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-7 rounded animate-pulse" style={{ background: '#f1f4ec' }} />)}
            </div>
          ) : !data || totalCount === 0 ? (
            <p className="px-6 py-12 text-[13px] text-center" style={{ color: C.muted }}>
              {search ? <>Nothing matches &ldquo;{search}&rdquo;.</> : filter === 'pinned' ? <>Nothing pinned yet. Use the <Pin size={12} className="inline -mt-0.5" aria-hidden /> on a template to keep it here.</> : 'No templates in this category.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: C.head, color: C.muted }}>
                    <th className={`${TH} w-[92px]`}>No.</th>
                    <th className={TH}>Template</th>
                    <th className={`${TH} w-[70px]`}>Version</th>
                    <th className={`${TH} text-right`}>Files</th>
                    <th className={`${TH} w-[52px] text-center`}><span className="sr-only">Pin</span><Pin size={12} aria-hidden className="inline" /></th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map(([dept, items]) => (
                    <Fragment key={dept}>
                      <GroupRow label={dept} count={items.length} noun="template" />
                      {items.map((t) => (
                        <TemplateRow key={t.id} t={t} pinned={isPinned(t)} pinning={pinningId === t.id} onTogglePin={() => togglePin(t)} />
                      ))}
                    </Fragment>
                  ))}
                  {visibleTests.length > 0 && (
                    <>
                      <GroupRow label="Standardized tests" count={visibleTests.length} noun="test" />
                      {visibleTests.map((t) => <TestRow key={t.id} t={t} />)}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function GroupRow({ label, count, noun }: { label: string; count: number; noun: string }) {
  return (
    <tr className="border-t" style={{ borderColor: C.rowLine, background: C.bar }}>
      <td colSpan={5} className="px-3 py-2">
        <span className="font-bold text-[12.5px]" style={{ color: C.text, fontFamily: 'var(--font-display)' }}>{label}</span>
        <span className="ml-2 px-1.5 rounded-full text-[11px] font-bold" style={{ background: '#f1f5f2', color: C.muted }}>{count} {noun}{count === 1 ? '' : 's'}</span>
      </td>
    </tr>
  )
}

function TemplateRow({ t, pinned, pinning, onTogglePin }: {
  t: Template
  pinned: boolean
  pinning: boolean
  onTogglePin: () => void
}) {
  // Online forms get an amber left edge; internal-only ones go muted (the API
  // blanks their file URLs for non-admins, so no buttons render).
  const online = !!(t.formLink || t.link) && !t.internalOnly
  const internal = t.internalOnly
  return (
    <tr className="border-t align-top transition-colors hover:bg-[#fafcf6]" style={{ borderColor: C.rowLine }}>
      <td className="px-3 py-2.5 whitespace-nowrap" style={{ boxShadow: `inset 4px 0 0 ${online ? C.amber : internal ? C.line : C.teal}` }}>
        {t.templateNo
          ? <span className="font-mono font-semibold" style={{ color: internal ? C.faint : C.deep }}>{t.templateNo}</span>
          : <span style={{ color: C.faint }}>—</span>}
      </td>
      <td className="px-3 py-2.5 min-w-[240px]">
        <p className="font-semibold text-[13px] flex flex-wrap items-center gap-1.5" style={{ color: internal ? C.muted : C.text }}>
          {t.templateName}
          {online && <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold" style={{ background: C.amberBg, color: C.amber }}>Online form</span>}
          {internal && <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold" style={{ background: '#f1f5f2', color: C.muted }}>Internal only</span>}
        </p>
        {t.description && <p className="text-[11.5px] mt-0.5 leading-relaxed line-clamp-2" style={{ color: C.muted }}>{t.description}</p>}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap font-mono" style={{ color: C.muted }}>{t.versionNumber ? `v${t.versionNumber}` : '—'}</td>
      <td className="px-3 py-2.5">
        {/* Fixed slots — link/form · PDF · DOCX — so every PDF button sits
            in one column and every DOCX in another, whatever a row has. */}
        <div className="grid grid-cols-[76px_64px_70px] gap-1.5 justify-end">
          <div className="flex flex-col gap-1.5">
            {t.formLink && (
              <a href={t.formLink} target="_blank" rel="noopener noreferrer" className={`${FILE_BTN} ${FOCUS}`} style={{ borderColor: '#E9D3A8', color: C.amber, background: C.amberBg }} title="Open the online form">
                <ExternalLink size={12} aria-hidden /> Form
              </a>
            )}
            {t.link && (
              <a href={t.link} target="_blank" rel="noopener noreferrer" className={`${FILE_BTN} ${FOCUS}`} style={{ borderColor: C.line, color: C.amber }} title="Open link">
                <ExternalLink size={12} aria-hidden /> Open
              </a>
            )}
          </div>
          <div>
            {t.pdfUrl && (
              <a href={t.pdfUrl} target="_blank" rel="noopener noreferrer" className={`${FILE_BTN} w-full ${FOCUS}`} style={{ borderColor: C.line, color: C.deep }} title="Open PDF in a new tab">
                <Eye size={12} aria-hidden /> PDF
              </a>
            )}
          </div>
          <div>
            {t.docxUrl && (
              <a href={t.docxUrl} download className={`${FILE_BTN} w-full ${FOCUS}`} style={{ borderColor: C.line, color: C.deep }} title="Download Word document">
                <Download size={12} aria-hidden /> DOCX
              </a>
            )}
            {!t.formLink && !t.link && !t.pdfUrl && !t.docxUrl && <span className="h-7 flex items-center justify-end" style={{ color: C.faint }}>—</span>}
          </div>
        </div>
      </td>
      <td className="px-2 py-2.5 text-center">
        <button type="button" onClick={onTogglePin} disabled={pinning}
          className={`w-7 h-7 inline-flex items-center justify-center rounded-lg transition-colors disabled:opacity-50 hover:bg-[#EDF3D9] ${FOCUS}`}
          style={{ color: pinned ? '#8A5A3C' : C.faint, background: pinned ? '#F6EBDD' : undefined }}
          title={pinned ? 'Unpin from your Pinned tab' : 'Pin to your Pinned tab'} aria-label={pinned ? `Unpin ${t.templateName}` : `Pin ${t.templateName}`} aria-pressed={pinned}>
          {pinning ? <Loader2 size={13} className="animate-spin" /> : <Pin size={13} fill={pinned ? 'currentColor' : 'none'} />}
        </button>
      </td>
    </tr>
  )
}

function TestRow({ t }: { t: StdTest }) {
  return (
    <tr className="border-t align-top transition-colors hover:bg-[#fafcf6]" style={{ borderColor: C.rowLine }}>
      <td className="px-3 py-2.5" style={{ boxShadow: 'inset 4px 0 0 #C9A27E' }}><ClipboardList size={14} style={{ color: '#8A5A3C' }} aria-hidden /></td>
      <td className="px-3 py-2.5">
        <p className="font-semibold text-[13px]" style={{ color: C.text }}>{t.name}</p>
        <p className="text-[11.5px] mt-0.5" style={{ color: C.muted }}>{t.department}</p>
      </td>
      <td className="px-3 py-2.5" style={{ color: C.faint }}>—</td>
      <td className="px-3 py-2.5">
        <div className="grid grid-cols-[76px_64px_70px] gap-1.5 justify-end">
          <div />
          <div>
            {t.pdfUrl
              ? <a href={t.pdfUrl} target="_blank" rel="noopener noreferrer" className={`${FILE_BTN} w-full ${FOCUS}`} style={{ borderColor: C.line, color: C.deep }} title="Open PDF in a new tab"><Eye size={12} aria-hidden /> PDF</a>
              : <span className="h-7 flex items-center justify-center" style={{ color: C.faint }}>—</span>}
          </div>
          <div />
        </div>
      </td>
      <td />
    </tr>
  )
}
