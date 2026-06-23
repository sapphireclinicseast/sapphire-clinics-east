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
import BranchSwitcher, { useBranchSwitcher } from '@/components/BranchSwitcher'

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
  const { branches, isMultiBranch, activeStaffId, switchBranch } = useBranchSwitcher()

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

  return (
    <div className="max-w-5xl mx-auto">
      {isMultiBranch && (
        <div className="mb-4 animate-fade-up">
          <BranchSwitcher branches={branches} activeStaffId={activeStaffId} onSwitch={switchBranch} />
        </div>
      )}

      {/* Hero */}
      <div className="hero-gradient rounded-2xl px-8 py-8 mb-6 animate-fade-up">
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-sm border border-white/20">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-white tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              Templates &amp; Forms
            </h1>
            <p className="text-white/70 text-sm mt-1">
              Operational forms, clinical templates, and standardized tests scoped to your department.
            </p>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4 animate-fade-up stagger-1">
        <FilterButton active={filter === 'all'} onClick={() => setFilter('all')} icon={<ClipboardList size={13} />} label="All" />
        <FilterButton active={filter === 'pinned'} onClick={() => setFilter('pinned')} icon={<Pin size={13} />} label="Pinned" />
        {seesAllDepts ? (
          techDepts.map((d) => (
            <FilterButton key={d} active={filter === d} onClick={() => setFilter(d)} icon={<Stethoscope size={13} />} label={DEPT_TAB_LABEL[d] ?? d} />
          ))
        ) : (
          <FilterButton active={filter === 'technical'} onClick={() => setFilter('technical')} icon={<Stethoscope size={13} />} label="Technical Department" />
        )}
        <FilterButton active={filter === 'admin'} onClick={() => setFilter('admin')} icon={<Briefcase size={13} />} label="Admin/Operations" />
        <FilterButton active={filter === 'hr'} onClick={() => setFilter('hr')} icon={<UserCog size={13} />} label="HR" />
      </div>

      {/* Search */}
      <div className="relative mb-5 animate-fade-up stagger-2">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mid-gray)]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by template name, number, or description…"
          className="input !pl-9 text-[13px]"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--mid-gray)] hover:text-[var(--charcoal)]"
            title="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-7 h-7 text-[var(--moss)] animate-spin" />
          <p className="text-sm text-[var(--mid-gray)]">Loading templates…</p>
        </div>
      ) : error ? (
        <div className="card-static text-center py-12 animate-fade-up">
          <p className="text-[13px] text-[var(--clay)] font-semibold">{error}</p>
          <button onClick={fetchTemplates} className="mt-3 text-[12px] font-semibold text-[var(--moss)] hover:underline">Try again</button>
        </div>
      ) : !data || totalCount === 0 ? (
        <div className="card-static text-center py-14 animate-fade-up">
          <div className="w-14 h-14 rounded-2xl bg-[var(--paper-2)] flex items-center justify-center mx-auto mb-3">
            <FileText size={22} className="text-[var(--mid-gray)]" />
          </div>
          <p className="text-[13px] text-[var(--narra)] font-semibold mb-1">No templates match.</p>
          <p className="text-[12px] text-[var(--mid-gray)] max-w-sm mx-auto">
            {search ? `Nothing for "${search}".` : 'Try a different filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([dept, items]) => (
            <section key={dept} className="animate-fade-up">
              <div className="flex items-center gap-3 mb-3">
                <span className="badge bg-[var(--moss)] text-white !text-[10px]">
                  {dept}
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--mid-gray)]">
                  {items.length} template{items.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="space-y-2">
                {items.map((t) => (
                  <TemplateRow
                    key={t.id}
                    t={t}
                    pinned={isPinned(t)}
                    pinning={pinningId === t.id}
                    onTogglePin={() => togglePin(t)}
                  />
                ))}
              </div>
            </section>
          ))}

          {visibleTests.length > 0 && (
            <section className="animate-fade-up">
              <div className="flex items-center gap-3 mb-3">
                <span className="badge bg-[var(--clay)] text-white !text-[10px]">Standardized Tests</span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--mid-gray)]">
                  {visibleTests.length} test{visibleTests.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="space-y-2">
                {visibleTests.map((t) => (
                  <TestRow key={t.id} t={t} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function FilterButton({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-2 rounded-lg border transition-colors',
        active
          ? 'bg-[var(--narra)] text-[var(--paper)] border-[var(--narra)]'
          : 'bg-white text-[var(--narra)] border-[var(--paper-3)] hover:bg-[var(--paper-2)]',
      )}
    >
      {icon}
      {label}
    </button>
  )
}

function TemplateRow({ t, pinned, pinning, onTogglePin }: {
  t: Template
  pinned: boolean
  pinning: boolean
  onTogglePin: () => void
}) {
  // Online form templates (Google Form / external link) get a Sun-tinted
  // card + ribbon to make them stand out. Internal-only templates go
  // grey + muted because clinicians can see they exist but can't
  // download them.
  const hasOnlineForm = !!(t.formLink || t.link)
  const isInternal = t.internalOnly
  return (
    <div
      className={cn(
        'card-static !p-4 flex flex-col sm:flex-row sm:items-center gap-3 transition-colors',
        hasOnlineForm && !isInternal && 'border-2 border-[var(--sun)] bg-[var(--sun-tint)]/30 shadow-[0_2px_12px_rgba(198,152,73,0.12)]',
        isInternal && 'bg-[var(--paper-2)] border-[var(--paper-3)] opacity-70',
      )}
    >
      {/* Left rail: prominent template number + pin toggle, both immediately visible. */}
      <div className="flex sm:flex-col items-center gap-2 sm:w-[88px] sm:shrink-0">
        {t.templateNo && (
          <div
            className={cn(
              'w-full px-2 py-2 rounded-xl text-center font-bold tracking-wider text-[12px] leading-tight',
              hasOnlineForm && !isInternal
                ? 'bg-[var(--sun)] text-white'
                : isInternal
                  ? 'bg-[var(--paper-3)] text-[var(--mid-gray)]'
                  : 'bg-[var(--narra)] text-[var(--paper)]',
            )}
            style={{ fontFamily: 'var(--font-display)' }}
            title={`Template ${t.templateNo}`}
          >
            {t.templateNo}
          </div>
        )}
        <button
          type="button"
          onClick={onTogglePin}
          disabled={pinning}
          className={cn(
            'inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors disabled:opacity-50',
            pinned
              ? 'bg-[var(--clay-tint)] text-[var(--clay)] hover:bg-[var(--clay)] hover:text-white'
              : 'text-[var(--mid-gray)] hover:bg-[var(--paper-2)]',
          )}
          title={pinned ? 'Unpin from your Pinned tab' : 'Pin to your Pinned tab'}
          aria-label={pinned ? 'Unpin' : 'Pin'}
        >
          {pinning ? (
            <Loader2 size={14} className="animate-spin" />
          ) : pinned ? (
            <Pin size={14} fill="currentColor" />
          ) : (
            <PinOff size={14} />
          )}
        </button>
      </div>

      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div
          className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
            hasOnlineForm && !isInternal
              ? 'bg-[var(--sun)] text-white'
              : isInternal
                ? 'bg-[var(--paper-3)] text-[var(--mid-gray)]'
                : 'bg-[var(--sage-tint)] text-[var(--moss)]',
          )}
        >
          <FileText size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <p
              className={cn(
                'font-bold text-[14px]',
                isInternal ? 'text-[var(--mid-gray)]' : 'text-[var(--narra)]',
              )}
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {t.templateName}
            </p>
            {t.versionNumber && (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--paper-2)] text-[var(--mid-gray)] border border-[var(--paper-3)]">
                v{t.versionNumber}
              </span>
            )}
            {hasOnlineForm && !isInternal && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--sun)] text-[var(--ink)]">
                <ExternalLink size={10} />
                Online Form
              </span>
            )}
            {isInternal && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--mid-gray)] text-white">
                Internal Only
              </span>
            )}
          </div>
          {t.description && (
            <p
              className={cn(
                'text-[12px] leading-relaxed line-clamp-2',
                isInternal ? 'text-[var(--mid-gray)]/80' : 'text-[var(--mid-gray)]',
              )}
            >
              {t.description}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 sm:shrink-0 flex-wrap">
        {/* For internal-only templates the API blanks out the URLs for
            non-admins, so the buttons just won't render. */}
        {t.formLink && (
          <a
            href={t.formLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[12px] font-bold px-4 py-2 rounded-lg bg-[var(--sun)] text-[var(--ink)] hover:bg-[#b3852f] hover:text-white transition-colors shadow-sm"
            title="Open online form (Google Forms)"
          >
            <ExternalLink size={13} />
            Open Online Form
          </a>
        )}
        {t.link && (
          <a
            href={t.link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-[var(--sun)] text-[var(--ink)] hover:bg-[#b3852f] hover:text-white transition-colors"
            title="Open link"
          >
            <ExternalLink size={13} />
            Open
          </a>
        )}
        {t.pdfUrl && (
          <a
            href={t.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-[var(--paper-3)] text-[var(--narra)] hover:bg-[var(--paper-2)] transition-colors"
            title="Open PDF in new tab"
          >
            <Eye size={14} />
            PDF
          </a>
        )}
        {t.docxUrl && (
          <a
            href={t.docxUrl}
            download
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-[var(--moss)] text-white hover:bg-[var(--narra)] transition-colors"
            title="Download Word document"
          >
            <Download size={14} />
            DOCX
          </a>
        )}
      </div>
    </div>
  )
}

function TestRow({ t }: { t: StdTest }) {
  return (
    <div className="card-static !p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-[var(--clay-tint)] text-[var(--clay)] flex items-center justify-center shrink-0">
        <ClipboardList size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-[14px] text-[var(--narra)]" style={{ fontFamily: 'var(--font-display)' }}>
          {t.name}
        </p>
        <p className="text-[11px] text-[var(--mid-gray)]">{t.department}</p>
      </div>
      {t.pdfUrl && (
        <a
          href={t.pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-[var(--paper-3)] text-[var(--narra)] hover:bg-[var(--paper-2)] transition-colors"
        >
          <Eye size={14} />
          PDF
        </a>
      )}
    </div>
  )
}
