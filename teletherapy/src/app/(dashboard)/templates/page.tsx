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

type Filter = 'all' | 'technical' | 'admin' | 'hr'

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
  const visibleTemplates = useMemo(() => {
    if (!data) return []
    let list = data.templates
    if (filter === 'technical') {
      // The clinician's own department (the "technical" one).
      const ownDept = data.department
      list = ownDept ? list.filter((t) => t.department === ownDept) : list
    } else if (filter === 'admin') {
      list = list.filter((t) => t.department === 'Admin/Operations')
    } else if (filter === 'hr') {
      list = list.filter((t) => t.department === 'HR')
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
    if (filter !== 'all' && filter !== 'technical') return []
    if (!search.trim()) return data.standardizedTests
    const q = search.trim().toLowerCase()
    return data.standardizedTests.filter((t) =>
      (t.name + ' ' + t.department).toLowerCase().includes(q),
    )
  }, [data, filter, search])

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
        <FilterButton active={filter === 'technical'} onClick={() => setFilter('technical')} icon={<Stethoscope size={13} />} label="Technical Department" />
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
                  <TemplateRow key={t.id} t={t} />
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

function TemplateRow({ t }: { t: Template }) {
  return (
    <div className="card-static !p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-[var(--sage-tint)] text-[var(--moss)] flex items-center justify-center shrink-0">
          <FileText size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <p className="font-bold text-[14px] text-[var(--narra)]" style={{ fontFamily: 'var(--font-display)' }}>
              {t.templateName}
            </p>
            {t.templateNo && (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--paper-2)] text-[var(--mid-gray)] border border-[var(--paper-3)]">
                {t.templateNo}
              </span>
            )}
            {t.versionNumber && (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--paper-2)] text-[var(--mid-gray)] border border-[var(--paper-3)]">
                v{t.versionNumber}
              </span>
            )}
          </div>
          {t.description && (
            <p className="text-[12px] text-[var(--mid-gray)] leading-relaxed line-clamp-2">{t.description}</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 sm:shrink-0 flex-wrap">
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
        {t.formLink && (
          <a
            href={t.formLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-[var(--clay)] text-white hover:bg-[var(--clay)]/85 transition-colors"
            title="Open online form"
          >
            <ExternalLink size={13} />
            Form
          </a>
        )}
        {t.link && (
          <a
            href={t.link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-[var(--paper-3)] text-[var(--narra)] hover:bg-[var(--paper-2)] transition-colors"
            title="Open link"
          >
            <ExternalLink size={13} />
            Open
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
