'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  FileText,
  Loader2,
  Search,
  X,
  Download,
  ExternalLink,
  ClipboardList,
  Briefcase,
  UserCog,
  Stethoscope,
  Eye,
  Pin,
  PinOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DashCard, EmptyState, ErrorCard, PageHeader, PillTabs, Skeleton, Tag,
  BTN_PRIMARY, BTN_SM, CARD_STYLE, CONTROL, CONTROL_STYLE, FOCUS, PAGE, PRIMARY_STYLE, SECONDARY_STYLE,
} from '@/components/hub/ui'

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

  const tabs = [
    { id: 'all', label: <span className="inline-flex items-center gap-1.5"><ClipboardList size={13} /> All</span> },
    { id: 'pinned', label: <span className="inline-flex items-center gap-1.5"><Pin size={13} /> Pinned</span> },
    ...(seesAllDepts
      ? techDepts.map((d) => ({ id: d, label: <span className="inline-flex items-center gap-1.5"><Stethoscope size={13} /> {DEPT_TAB_LABEL[d] ?? d}</span> }))
      : [{ id: 'technical', label: <span className="inline-flex items-center gap-1.5"><Stethoscope size={13} /> Technical Department</span> }]),
    { id: 'admin', label: <span className="inline-flex items-center gap-1.5"><Briefcase size={13} /> Admin/Operations</span> },
    { id: 'hr', label: <span className="inline-flex items-center gap-1.5"><UserCog size={13} /> HR</span> },
  ]

  return (
    <div className={`${PAGE} !max-w-[1000px]`}>
      <PageHeader
        eyebrow="Resources"
        title="Templates & Forms"
        description="Operational forms, clinical templates, and standardized tests scoped to your department."
      />

      {/* Filters + search */}
      <section className="rounded-xl p-3 sm:p-4 space-y-3 min-w-0" style={CARD_STYLE}>
        <div className="overflow-x-auto -mx-1 px-1">
          <PillTabs label="Template category" value={filter} onChange={setFilter} tabs={tabs} />
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by template name, number, or description…"
            aria-label="Search templates"
            className={`${CONTROL} w-full h-10 pl-9 pr-9`}
            style={CONTROL_STYLE}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className={`absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md flex items-center justify-center hover:bg-[var(--off-white)] ${FOCUS}`}
              style={{ color: 'var(--mid-gray)' }}
              title="Clear search"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
        {!loading && !error && data && (
          <p className="text-[11.5px] px-0.5" style={{ color: 'var(--mid-gray)' }}>
            {visibleTemplates.length} template{visibleTemplates.length === 1 ? '' : 's'}
            {visibleTests.length > 0 && <> · {visibleTests.length} standardized test{visibleTests.length === 1 ? '' : 's'}</>}
          </p>
        )}
      </section>

      {/* Body */}
      {loading ? (
        <div className="space-y-3" role="status" aria-label="Loading templates">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : error ? (
        <ErrorCard title="Could not load templates" hint={error} onRetry={fetchTemplates} />
      ) : !data || totalCount === 0 ? (
        <div className="rounded-xl" style={CARD_STYLE}>
          <EmptyState
            icon={search ? 'search' : 'file'}
            title="No templates match."
            hint={search ? `Nothing for "${search}".` : 'Try a different filter.'}
          />
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([dept, items]) => (
            <DashCard
              key={dept}
              title={<>{dept}<span className="ml-1.5 text-[12px] font-semibold tabular-nums" style={{ color: 'var(--mid-gray)' }}>{items.length}</span></>}
              icon={<FileText size={16} />}
              flush
            >
              <ul>
                {items.map((t, i) => (
                  <TemplateRow
                    key={t.id}
                    t={t}
                    first={i === 0}
                    pinned={isPinned(t)}
                    pinning={pinningId === t.id}
                    onTogglePin={() => togglePin(t)}
                  />
                ))}
              </ul>
            </DashCard>
          ))}

          {visibleTests.length > 0 && (
            <DashCard
              title={<>Standardized Tests<span className="ml-1.5 text-[12px] font-semibold tabular-nums" style={{ color: 'var(--mid-gray)' }}>{visibleTests.length}</span></>}
              icon={<ClipboardList size={16} />}
              flush
            >
              <ul>
                {visibleTests.map((t, i) => (
                  <TestRow key={t.id} t={t} first={i === 0} />
                ))}
              </ul>
            </DashCard>
          )}
        </div>
      )}
    </div>
  )
}

function TemplateRow({ t, first, pinned, pinning, onTogglePin }: {
  t: Template
  first: boolean
  pinned: boolean
  pinning: boolean
  onTogglePin: () => void
}) {
  // Online form templates (Google Form / external link) get a warm tint and
  // a left rule so they stand out. Internal-only templates go muted because
  // clinicians can see they exist but can't download them.
  const hasOnlineForm = !!(t.formLink || t.link)
  const isInternal = t.internalOnly
  const online = hasOnlineForm && !isInternal
  return (
    <li
      className="px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3"
      style={{
        borderTop: first ? undefined : '1px solid var(--light-gray)',
        ...(online ? { background: 'rgba(198,152,73,0.07)', boxShadow: 'inset 3px 0 0 var(--sun)' } : null),
        ...(isInternal ? { background: '#F8FAF2' } : null),
      }}
    >
      <div className={cn('flex items-start gap-3 flex-1 min-w-0', isInternal && 'opacity-70')}>
        {/* Template number + pin toggle, side by side. */}
        <div className="flex flex-col items-center gap-1.5 shrink-0 w-[76px]">
          {t.templateNo ? (
            <span
              className="w-full px-1.5 py-1.5 rounded-lg text-center font-bold tracking-wider text-[11.5px] leading-tight break-words"
              style={{
                fontFamily: 'var(--font-display)',
                ...(online
                  ? { background: 'var(--sun)', color: '#fff' }
                  : isInternal
                    ? { background: 'var(--paper-3)', color: 'var(--mid-gray)' }
                    : { background: 'var(--pale-teal)', color: 'var(--deep-teal)' }),
              }}
              title={`Template ${t.templateNo}`}
            >
              {t.templateNo}
            </span>
          ) : (
            <span className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>
              <FileText size={17} />
            </span>
          )}
          <button
            type="button"
            onClick={onTogglePin}
            disabled={pinning}
            className={cn(
              `inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-semibold transition-colors disabled:opacity-50 ${FOCUS}`,
              pinned ? 'hover:opacity-90' : 'hover:bg-[var(--off-white)]',
            )}
            style={pinned ? { background: 'var(--clay-tint)', color: '#8A5A3C' } : { color: 'var(--mid-gray)' }}
            title={pinned ? 'Unpin from your Pinned tab' : 'Pin to your Pinned tab'}
            aria-label={pinned ? 'Unpin' : 'Pin'}
            aria-pressed={pinned}
          >
            {pinning ? (
              <Loader2 size={12} className="animate-spin" />
            ) : pinned ? (
              <Pin size={12} fill="currentColor" />
            ) : (
              <PinOff size={12} />
            )}
            {pinned ? 'Pinned' : 'Pin'}
          </button>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <p className="font-semibold text-[14px] mr-0.5" style={{ fontFamily: 'var(--font-display)', color: isInternal ? 'var(--mid-gray)' : 'var(--charcoal)' }}>
              {t.templateName}
            </p>
            {t.versionNumber && <Tag tone="neutral">v{t.versionNumber}</Tag>}
            {online && <Tag tone="warn">Online form</Tag>}
            {isInternal && <Tag tone="neutral">Internal only</Tag>}
          </div>
          {t.description && (
            <p className="text-[12.5px] leading-relaxed line-clamp-2" style={{ color: 'var(--mid-gray)' }}>
              {t.description}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-1.5 sm:shrink-0 flex-wrap">
        {/* For internal-only templates the API blanks out the URLs for
            non-admins, so the buttons just won't render. */}
        {t.formLink && (
          <a
            href={t.formLink}
            target="_blank"
            rel="noopener noreferrer"
            className={BTN_PRIMARY}
            style={{ background: '#8C6A2D' }}
            title="Open online form (Google Forms)"
          >
            <ExternalLink size={13} />
            Open Online Form
          </a>
        )}
        {t.link && (
          <a href={t.link} target="_blank" rel="noopener noreferrer" className={BTN_SM} style={{ ...SECONDARY_STYLE, color: '#8C6A2D' }} title="Open link">
            <ExternalLink size={13} />
            Open
          </a>
        )}
        {t.pdfUrl && (
          <a href={t.pdfUrl} target="_blank" rel="noopener noreferrer" className={BTN_SM} style={{ ...SECONDARY_STYLE, color: 'var(--deep-teal)' }} title="Open PDF in new tab">
            <Eye size={13} />
            PDF
          </a>
        )}
        {t.docxUrl && (
          <a href={t.docxUrl} download className={`${BTN_SM} text-white`} style={PRIMARY_STYLE} title="Download Word document">
            <Download size={13} />
            DOCX
          </a>
        )}
      </div>
    </li>
  )
}

function TestRow({ t, first }: { t: StdTest; first: boolean }) {
  return (
    <li className="px-4 sm:px-5 py-3.5 flex items-center gap-3" style={{ borderTop: first ? undefined : '1px solid var(--light-gray)' }}>
      <span className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--clay-tint)', color: '#8A5A3C' }}>
        <ClipboardList size={17} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[14px]" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          {t.name}
        </p>
        <p className="text-[11.5px]" style={{ color: 'var(--mid-gray)' }}>{t.department}</p>
      </div>
      {t.pdfUrl && (
        <a href={t.pdfUrl} target="_blank" rel="noopener noreferrer" className={BTN_SM} style={{ ...SECONDARY_STYLE, color: 'var(--deep-teal)' }}>
          <Eye size={13} />
          PDF
        </a>
      )}
    </li>
  )
}
