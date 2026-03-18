'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  FileText, QrCode, BarChart3, ExternalLink, Copy, Check,
  RefreshCw, Download, ChevronRight, Building2,
} from 'lucide-react'

// ── Form definitions (healthcare registration forms) ─────────────────────────
const FORMS = [
  { id: 'GULaVBpI', title: 'Registration Form', branch: 'SANDBOX_EAST', branchLabel: 'Sandbox East' },
  { id: 'ChrSrsBF', title: 'Group Therapy Registration', branch: 'SANDBOX_EAST', branchLabel: 'Sandbox East' },
  { id: 'SGWVxqcW', title: 'SIP Registration Form', branch: 'SANDBOX_EAST', branchLabel: 'Sandbox East' },
  { id: 'X2YDKTaH', title: 'Psych Registration Form', branch: 'SANDBOX_EAST', branchLabel: 'Sandbox East' },
  { id: 'a3F4SwaW', title: 'Registration Form (New)', branch: 'SANDBOX_GREENHILLS', branchLabel: 'Sandbox Greenhills' },
  { id: 'VaCB1bkE', title: 'Registration Form', branch: 'SANDBOX_GREENHILLS', branchLabel: 'Sandbox Greenhills' },
]

const HR_FORM_BASE = 'https://hr.sapphireclinicseast.org/forms/fill/'

// Branch mapping for role-based filtering
const ROLE_BRANCH: Record<string, string> = {
  SBEA_FRONT_DESK: 'SANDBOX_EAST',
  SBGH_FRONT_DESK: 'SANDBOX_GREENHILLS',
  SBEA_ADMIN: 'SANDBOX_EAST',
  SBGH_ADMIN: 'SANDBOX_GREENHILLS',
}

interface Props { role: string }

export default function RegistrationFormsClient({ role }: Props) {
  const [selectedForm, setSelectedForm] = useState<typeof FORMS[0] | null>(null)
  const [tab, setTab] = useState<'qr' | 'results'>('qr')
  const [copied, setCopied] = useState(false)
  const [results, setResults] = useState<{ fields: any[]; items: any[]; total: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Filter forms by branch for front desk users
  const userBranch = ROLE_BRANCH[role] || ''
  const isFrontDesk = role === 'SBEA_FRONT_DESK' || role === 'SBGH_FRONT_DESK'
  const visibleForms = userBranch ? FORMS.filter(f => f.branch === userBranch) : FORMS

  // Group by branch
  const branches = [...new Set(visibleForms.map(f => f.branch))]

  const copyLink = useCallback((url: string) => {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  const loadResults = useCallback(async (formId: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/registration-forms/${formId}/responses`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Failed to load')
      setResults({ fields: data.fields || [], items: data.items || [], total: data.total_items || 0 })
    } catch (e: any) {
      setError(e.message)
      setResults(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const exportCSV = useCallback(() => {
    if (!results || !results.items.length || !selectedForm) return
    const esc = (v: string) => `"${String(v || '').replace(/"/g, '""')}"`
    const headers = ['#', 'Submitted At', ...results.fields.map((f: any) => f.title)]
    const rows = results.items.map((item: any, i: number) => [
      i + 1,
      item.submitted_at ? new Date(item.submitted_at).toLocaleString('en-US', { timeZone: 'Asia/Manila' }) : '',
      ...results.fields.map((field: any) => {
        const ans = (item.answers || []).find((a: any) => a.field?.id === field.id)
        return extractAnswer(ans)
      })
    ])
    const csv = [headers.map(esc).join(','), ...rows.map((r: any[]) => r.map(esc).join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedForm.title.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [results, selectedForm])

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
            <div className="flex items-center gap-3 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--teal)' }}>
                {selectedForm.branchLabel}
              </span>
            </div>
            <h2 className="text-lg font-bold mb-4" style={{ fontFamily: 'var(--font-display)' }}>
              {selectedForm.title}
            </h2>

            {/* Sub-tabs */}
            <div className="flex gap-1 mb-5 p-1 rounded-lg" style={{ background: 'var(--bg-secondary, #f5f5f5)' }}>
              {[
                { key: 'qr' as const, label: 'QR & Link', icon: QrCode },
                { key: 'results' as const, label: 'Responses', icon: BarChart3 },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => { setTab(t.key); if (t.key === 'results' && !results) loadResults(selectedForm.id) }}
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all flex-1 justify-center"
                  style={tab === t.key ? { background: '#fff', color: 'var(--near-black)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : { color: 'var(--text-secondary)' }}
                >
                  <t.icon size={14} />
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'qr' && (
              <div className="flex flex-col items-center py-6">
                {/* QR Code */}
                <div className="p-4 rounded-2xl mb-4" style={{ border: '2px solid var(--border)', background: '#fff' }}>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(HR_FORM_BASE + selectedForm.id)}`}
                    alt="QR Code"
                    width={220}
                    height={220}
                  />
                </div>
                {/* Link */}
                <div className="flex items-center gap-2 w-full max-w-md">
                  <input
                    readOnly
                    value={HR_FORM_BASE + selectedForm.id}
                    className="flex-1 px-3 py-2 rounded-lg text-sm"
                    style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-secondary, #f9f9f9)' }}
                  />
                  <button
                    onClick={() => copyLink(HR_FORM_BASE + selectedForm.id)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all"
                    style={{ background: 'var(--teal)', color: '#fff' }}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <a
                  href={HR_FORM_BASE + selectedForm.id}
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
                    {results ? `${results.total} responses` : '—'}
                  </span>
                  <div className="flex-1" />
                  <button
                    onClick={() => loadResults(selectedForm.id)}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{ border: '1px solid var(--border)' }}
                  >
                    <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                  <button
                    onClick={exportCSV}
                    disabled={!results?.items.length}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
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
                          {results.fields.map((f: any) => (
                            <th key={f.id} className="text-left px-3 py-2 font-semibold text-xs uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
                              {f.title}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {results.items.map((item: any, i: number) => (
                          <tr key={item.landing_id || i} className="hover:bg-gray-50 transition-colors" style={{ borderTop: '1px solid var(--border)' }}>
                            <td className="px-3 py-2">{i + 1}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {item.submitted_at ? new Date(item.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' }) : '—'}
                            </td>
                            {results.fields.map((field: any) => {
                              const ans = (item.answers || []).find((a: any) => a.field?.id === field.id)
                              return (
                                <td key={field.id} className="px-3 py-2 max-w-[200px] truncate" title={extractAnswer(ans)}>
                                  {extractAnswer(ans)}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
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
        <div className="space-y-8">
          {branches.map(branch => {
            const branchForms = visibleForms.filter(f => f.branch === branch)
            const branchLabel = branchForms[0]?.branchLabel || branch
            return (
              <div key={branch}>
                <div className="flex items-center gap-2 mb-3">
                  <Building2 size={15} style={{ color: 'var(--teal)' }} />
                  <h2 className="text-sm font-bold uppercase tracking-wider" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-secondary)' }}>
                    {branchLabel}
                  </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {branchForms.map(form => (
                    <button
                      key={form.id}
                      onClick={() => setSelectedForm(form)}
                      className="text-left p-4 rounded-xl transition-all hover:shadow-md group"
                      style={{ background: '#fff', border: '1px solid var(--border)' }}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-sm" style={{ fontFamily: 'var(--font-display)', color: 'var(--near-black)' }}>
                            {form.title}
                          </p>
                          <p className="text-xs mt-1 font-mono" style={{ color: 'var(--text-secondary)' }}>
                            {form.id}
                          </p>
                        </div>
                        <ChevronRight size={16} className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--teal)' }} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Extract answer helper ────────────────────────────────────────────────────
function extractAnswer(answer: any): string {
  if (!answer) return '—'
  switch (answer.type) {
    case 'text': return answer.text || ''
    case 'email': return answer.email || ''
    case 'number': return String(answer.number ?? '')
    case 'boolean': return answer.boolean ? 'Yes' : 'No'
    case 'date': return answer.date ? answer.date.split('T')[0] : ''
    case 'choice': return answer.choice ? (answer.choice.label || '') : ''
    case 'choices': return answer.choices ? (answer.choices.labels || []).join(', ') : ''
    case 'phone_number': return answer.phone_number || ''
    case 'file_url': return answer.file_url || answer.text || ''
    default: return answer.text || answer.email || '—'
  }
}
