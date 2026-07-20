'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  FileText, QrCode, BarChart3, ExternalLink, Copy, Check,
  RefreshCw, Download, ChevronRight, Trash2, Pencil, X,
} from 'lucide-react'

// ── Form definitions ─────────────────────────────────────────────────────────
const FORM_TYPES: Array<{ key: string; title: string; sbea: string; sbgh: string | null; subtitle?: string; intro?: string }> = [
  { key: 'registration',  title: 'Registration Form',          sbea: 'GULaVBpI', sbgh: 'VaCB1bkE' },
  { key: 'group-therapy', title: 'Group Therapy Registration', sbea: 'ChrSrsBF', sbgh: 'tT8QASYo' },
  {
    key:      'sip',
    title:    'ALAGA Program Registration',
    subtitle: 'Allied Learners Advancing Genuine Access',
    intro:    'The ALAGA Program pairs patients with student therapists who are completing their clinical internship hours — all sessions are directly supervised by our licensed clinicians. Because sessions are conducted under supervised training, they are offered at a significantly lower fee than our regular therapy rates, making quality rehabilitation more accessible to families.',
    sbea:     'SGWVxqcW',
    sbgh:     'i8rFr7P6',
  },
  { key: 'psych',         title: 'Psych Registration Form',    sbea: 'X2YDKTaH', sbgh: null },
]

const HR_FORM_BASE = 'https://hr.sapphireclinicseast.org/forms/fill/'

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
  const [tab, setTab]                   = useState<'qr' | 'results'>('qr')
  const [qrBranch, setQrBranch]         = useState<'SBEA' | 'SBGH'>('SBEA')
  const [copied, setCopied]             = useState(false)
  const [results, setResults]           = useState<{ fields: any[]; items: ResponseItem[]; total: number } | null>(null)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')
  const [deletingId, setDeletingId]     = useState<string | null>(null)
  const [editingItem, setEditingItem]   = useState<ResponseItem | null>(null)
  const [editValues, setEditValues]     = useState<Record<string, string>>({})
  const [saving, setSaving]             = useState(false)
  const [newCutoff, setNewCutoff]       = useState<Date | null>(null)

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

  // Reset qrBranch when form changes
  useEffect(() => {
    if (selectedForm) setQrBranch(isSBGH ? 'SBGH' : 'SBEA')
  }, [selectedForm, isSBGH])

  const getFormUrl = (form: FormType, branch: 'SBEA' | 'SBGH') =>
    HR_FORM_BASE + (branch === 'SBGH' && form.sbgh ? form.sbgh : form.sbea)

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

      const fields = d1.fields || []
      let items: ResponseItem[] = (d1.items || []).map((i: any) => ({ ...i, _branch: 'SBEA', _formId: form.sbea }))

      if (res2) {
        const d2 = await res2.json()
        if (d2.ok) {
          const sbghItems: ResponseItem[] = (d2.items || []).map((i: any) => ({ ...i, _branch: 'SBGH', _formId: form.sbgh }))
          items = [...items, ...sbghItems].sort(
            (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
          )
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
    a.download = `${selectedForm.title.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }, [results, selectedForm, isAdmin])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(26,123,138,0.1)' }}>
          <FileText size={20} style={{ color: 'var(--teal)' }} />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--near-black)' }}>
            Registration Forms
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Patient registration forms — QR codes, links, and responses
          </p>
        </div>
      </div>

      {selectedForm ? (
        /* ── Form Detail View ─────────────────────────────────────── */
        <div>
          <button
            onClick={() => { setSelectedForm(null); setResults(null); setTab('qr') }}
            className="flex items-center gap-1 text-sm font-medium mb-4 hover:opacity-80 transition-opacity"
            style={{ color: 'var(--teal)' }}
          >
            ← Back to Forms
          </button>

          <div className="rounded-xl p-6" style={{ background: '#fff', border: '1px solid var(--border)' }}>
            <div className="mb-4">
              <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                {selectedForm.title}
              </h2>
              {selectedForm.subtitle && (
                <p className="text-sm font-medium italic mt-0.5" style={{ color: 'var(--teal)' }}>
                  {selectedForm.subtitle}
                </p>
              )}
            </div>

            {selectedForm.intro && (
              <div className="mb-5 rounded-xl p-4" style={{ background: 'rgba(26,123,138,0.07)', border: '1px solid rgba(26,123,138,0.2)' }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--teal)' }}>About this program</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(26,123,138,0.15)', color: 'var(--teal)' }}>
                    Lower fee than regular sessions
                  </span>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--near-black)' }}>
                  {selectedForm.intro}
                </p>
              </div>
            )}

            {/* Sub-tabs */}
            <div className="flex gap-1 mb-5 p-1 rounded-lg" style={{ background: 'var(--bg-secondary, #f5f5f5)' }}>
              {[
                { key: 'qr' as const, label: 'QR & Link', icon: QrCode },
                { key: 'results' as const, label: 'Responses', icon: BarChart3 },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => { setTab(t.key); if (t.key === 'results' && !results) loadResults(selectedForm) }}
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all flex-1 justify-center"
                  style={tab === t.key ? { background: '#fff', color: 'var(--near-black)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : { color: 'var(--text-secondary)' }}
                >
                  <t.icon size={14} />
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'qr' && (
              <div className="flex flex-col items-center py-4">
                {/* Branch toggle — hidden for single-branch front desk */}
                {(isAdmin || (!!selectedForm.sbgh && !branchRole)) && (
                  <div className="flex gap-1 mb-5 p-1 rounded-lg" style={{ background: 'var(--bg-secondary, #f5f5f5)' }}>
                    {(['SBEA', 'SBGH'] as const).map(b => {
                      const available = b === 'SBEA' ? true : !!selectedForm.sbgh
                      return (
                        <button
                          key={b}
                          onClick={() => available && setQrBranch(b)}
                          disabled={!available}
                          className="px-5 py-1.5 rounded-md text-sm font-semibold transition-all"
                          style={
                            qrBranch === b
                              ? { background: 'var(--teal)', color: '#fff' }
                              : { color: available ? 'var(--text-secondary)' : '#ccc', cursor: available ? 'pointer' : 'not-allowed' }
                          }
                        >
                          {b === 'SBEA' ? 'East Branch' : 'Greenhills Branch'}
                          {!available && <span className="ml-1 text-xs opacity-60">(soon)</span>}
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* QR Code */}
                <div className="p-4 rounded-2xl mb-3" style={{ border: '2px solid var(--border)', background: '#fff' }}>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(getFormUrl(selectedForm, qrBranch))}`}
                    alt="QR Code"
                    width={220}
                    height={220}
                  />
                </div>
                <p className="text-xs font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>
                  {qrBranch === 'SBEA' ? 'East Branch' : 'Greenhills Branch'}
                </p>

                {/* Link */}
                <div className="flex items-center gap-2 w-full max-w-md">
                  <input
                    readOnly
                    value={getFormUrl(selectedForm, qrBranch)}
                    className="flex-1 px-3 py-2 rounded-lg text-sm"
                    style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-secondary, #f9f9f9)' }}
                  />
                  <button
                    onClick={() => copyLink(getFormUrl(selectedForm, qrBranch))}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
                    style={{ background: 'var(--teal)', color: '#fff' }}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <a
                  href={getFormUrl(selectedForm, qrBranch)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 mt-3 text-sm font-medium hover:opacity-80"
                  style={{ color: 'var(--teal)' }}
                >
                  Open form <ExternalLink size={13} />
                </a>
              </div>
            )}

            {tab === 'results' && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-sm font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
                    {results ? `${results.total} response${results.total !== 1 ? 's' : ''}` : '—'}
                  </span>
                  <div className="flex-1" />
                  <button
                    onClick={() => loadResults(selectedForm)}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ border: '1px solid var(--border)' }}
                  >
                    <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                  <button
                    onClick={exportCSV}
                    disabled={!results?.items.length}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: 'var(--teal)', color: '#fff', opacity: results?.items.length ? 1 : 0.4 }}
                  >
                    <Download size={12} />
                    Export CSV
                  </button>
                </div>

                {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

                {loading && !results && (
                  <div className="text-center py-12 text-sm" style={{ color: 'var(--text-secondary)' }}>Loading responses...</div>
                )}

                {results && results.items.length === 0 && (
                  <div className="text-center py-12 text-sm" style={{ color: 'var(--text-secondary)' }}>No responses yet.</div>
                )}

                {results && results.items.length > 0 && (
                  <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: 'var(--bg-secondary, #f9f9f9)' }}>
                          <th className="text-left px-3 py-2 font-semibold text-xs uppercase tracking-wider" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>#</th>
                          <th className="text-left px-3 py-2 font-semibold text-xs uppercase tracking-wider" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>Submitted</th>
                          {isAdmin && selectedForm.sbgh && (
                            <th className="text-left px-3 py-2 font-semibold text-xs uppercase tracking-wider" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>Branch</th>
                          )}
                          {results.fields.map((f: any) => (
                            <th key={f.id} className="text-left px-3 py-2 font-semibold text-xs uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
                              {f.title}
                            </th>
                          ))}
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {results.items.map((item, i) => {
                          const isNew = newCutoff && item.submitted_at
                            ? new Date(item.submitted_at) > newCutoff
                            : false
                          const respName = getResponsePatientName(item, results.fields).toLowerCase().trim()
                          const converted = respName !== '' && patientNames.has(respName)
                          return (
                          <tr
                            key={item.landing_id || i}
                            className="transition-colors"
                            style={{
                              borderTop: '1px solid var(--border)',
                              // Priority: if converted → green; if new only → yellow; else plain
                              background: converted ? '#F0FDF4' : isNew ? '#FEFCE8' : undefined,
                              borderLeft: converted ? '3px solid #16A34A' : isNew ? '3px solid #EAB308' : '3px solid transparent',
                            }}
                          >
                            <td className="px-3 py-2" style={{ color: converted ? '#15803D' : isNew ? '#854D0E' : undefined, fontWeight: (isNew || converted) ? 600 : undefined }}>{i + 1}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <div className="flex items-center gap-2 flex-wrap">
                                {item.submitted_at ? new Date(item.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' }) : '—'}
                                {isNew && (
                                  <span style={{ background: '#EAB308', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 9999, letterSpacing: '0.05em', flexShrink: 0 }}>
                                    NEW
                                  </span>
                                )}
                                {converted && (
                                  <span style={{ background: '#DCFCE7', color: '#15803D', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 9999, letterSpacing: '0.05em', flexShrink: 0 }}>
                                    CONVERTED
                                  </span>
                                )}
                              </div>
                            </td>
                            {isAdmin && selectedForm.sbgh && (
                              <td className="px-3 py-2">
                                <span
                                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                                  style={item._branch === 'SBEA'
                                    ? { background: 'rgba(26,123,138,0.1)', color: 'var(--teal)' }
                                    : { background: 'rgba(234,179,8,0.1)', color: '#92400e' }
                                  }
                                >
                                  {item._branch === 'SBEA' ? 'East Branch' : 'Greenhills Branch'}
                                </span>
                              </td>
                            )}
                            {results.fields.map((field: any) => {
                              const ans = (item.answers || []).find((a: any) => a.field?.id === field.id)
                              return (
                                <td key={field.id} className="px-3 py-2 max-w-[200px] truncate" title={extractAnswer(ans)}>
                                  {extractAnswer(ans)}
                                </td>
                              )
                            })}
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1 justify-end">
                                <button
                                  onClick={() => openEdit(item, results.fields)}
                                  className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                                  title="Edit"
                                >
                                  <Pencil size={13} style={{ color: 'var(--teal)' }} />
                                </button>
                                <button
                                  onClick={() => handleDelete(item)}
                                  disabled={deletingId === item.landing_id}
                                  className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 size={13} style={{ color: deletingId === item.landing_id ? '#ccc' : '#ef4444' }} />
                                </button>
                              </div>
                            </td>
                          </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── Form Cards Grid ──────────────────────────────────────── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleForms.map(form => (
            <button
              key={form.key}
              onClick={() => setSelectedForm(form)}
              className="text-left p-4 rounded-xl transition-all hover:shadow-md group"
              style={{ background: '#fff', border: '1px solid var(--border)' }}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0 pr-2">
                  <p className="font-semibold text-sm" style={{ fontFamily: 'var(--font-display)', color: 'var(--near-black)' }}>
                    {form.title}
                  </p>
                  {form.subtitle && (
                    <p className="text-xs mt-0.5 font-medium italic" style={{ color: 'var(--teal)' }}>
                      {form.subtitle}
                    </p>
                  )}
                  <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                    {form.sbgh ? 'East Branch · Greenhills Branch' : 'East Branch'}
                  </p>
                  {form.intro && (
                    <span className="inline-flex items-center mt-2 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(26,123,138,0.1)', color: 'var(--teal)' }}>
                      Lower fee available
                    </span>
                  )}
                </div>
                <ChevronRight size={16} className="mt-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--teal)' }} />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── Edit Modal ──────────────────────────────────────────────── */}
      {editingItem && results && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto p-6" style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-base" style={{ fontFamily: 'var(--font-display)' }}>Edit Response</h3>
              <button onClick={() => setEditingItem(null)} className="p-1 rounded hover:bg-gray-100">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              {results.fields.map((f: any) => (
                <div key={f.id}>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                    {f.title}
                  </label>
                  <input
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-2"
                    style={{ border: '1px solid var(--border)', '--tw-ring-color': 'var(--teal)' } as any}
                    value={editValues[f.id] || ''}
                    onChange={e => setEditValues(prev => ({ ...prev, [f.id]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setEditingItem(null)}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium"
                style={{ border: '1px solid var(--border)' }}
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ background: saving ? '#9ca3af' : 'var(--teal)' }}
              >
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
