'use client'

// Partner Institutions — the schools and companies we hold agreements with.
//
// Read-only by design. HR Hub owns these records and is the only place they can
// be edited; this exists so whoever is on the desk can answer "do we have a
// discount with that school?" without messaging HR and waiting.
//
// Nothing here writes, so there is no role check beyond being signed in — see
// /api/partner-institutions, which is the thing actually holding the shared key.

import { useEffect, useMemo, useState } from 'react'
import { Search, Building2, ExternalLink, RefreshCw, Percent, Info } from 'lucide-react'

interface Discount {
  serviceId: string; serviceLabel: string; discountType: string; value: number; note: string
}
interface Institution {
  id: string
  name: string
  type: string
  typeLabel: string
  pointOfContact: string
  email: string
  mobile: string
  telephone: string
  services: { id: string; label: string }[]
  discounts: Discount[]
  agreementType: string
  effectivityFrom: string
  effectivityTo: string
  hasCommission: boolean
  commissionType: string
  commissionValue: number
  commissionNote: string
  hasDocument: boolean
  photoCount: number
  remarks: string
  updatedAt: string
}

const HR_URL = 'https://hr.sapphireclinicseast.org/modules/partner-institutions/index.html'

function fmtDate(d: string) {
  if (!d) return ''
  const dt = new Date(`${d}T00:00:00Z`)
  return Number.isNaN(dt.getTime()) ? d
    : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

/** "20% off" / "₱500 off" — the two shapes HR stores. */
function discountLabel(d: Discount) {
  const v = d.discountType === 'percent' ? `${d.value}%` : `₱${Number(d.value).toLocaleString()}`
  return `${v} off`
}

/**
 * An agreement that has an end date in the past is worth flagging rather than
 * listing as if it still stands — front desk would otherwise honour a discount
 * the clinic is no longer party to. An empty end date means open-ended.
 */
function isExpired(inst: Institution) {
  if (!inst.effectivityTo) return false
  return inst.effectivityTo < new Date().toISOString().slice(0, 10)
}

export default function PartnerInstitutionsPage() {
  const [list, setList] = useState<Institution[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [type, setType] = useState('all')

  async function load() {
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/partner-institutions', { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Could not load partner institutions')
      setList(d.institutions ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load partner institutions')
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const types = useMemo(
    () => [...new Set(list.map(i => i.typeLabel).filter(Boolean))].sort(),
    [list],
  )

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return list.filter(i => {
      if (type !== 'all' && i.typeLabel !== type) return false
      if (!needle) return true
      // Contact and service names too: "who do we call at Xavier" and "who do
      // we have an OT discount with" are both questions this page gets asked.
      return [i.name, i.pointOfContact, i.email, i.remarks, ...i.services.map(s => s.label)]
        .join(' ').toLowerCase().includes(needle)
    })
  }, [list, q, type])

  const card: React.CSSProperties = {
    background: '#fff', border: '1px solid var(--light-gray)', borderRadius: '0.75rem',
  }
  const chip: React.CSSProperties = {
    fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99,
    background: '#EEF2F4', color: '#475569', whiteSpace: 'nowrap',
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <p style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--teal)', textTransform: 'uppercase' }}>
            Clinic Tools
          </p>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--charcoal)', margin: '0.15rem 0' }}>
            Partner Institutions
          </h1>
          <p style={{ color: 'var(--mid-gray)', fontSize: '0.85rem' }}>
            Schools and companies we hold agreements with, and what each one entitles them to.
          </p>
        </div>
        <button onClick={load} disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.45rem 0.85rem', borderRadius: 8,
                   border: '1px solid var(--light-gray)', background: '#fff', color: 'var(--charcoal)',
                   fontSize: '0.8rem', fontWeight: 600, cursor: loading ? 'default' : 'pointer' }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Said plainly rather than left for someone to discover by hunting for a
          save button that is not there. */}
      <div style={{ ...card, display: 'flex', alignItems: 'flex-start', gap: 8, padding: '0.7rem 0.9rem', marginBottom: '1rem', background: '#F1F7F8', borderColor: '#CFE3E6' }}>
        <Info size={15} style={{ color: 'var(--teal)', flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: '0.8rem', color: '#12606C', lineHeight: 1.5, margin: 0 }}>
          View only. These records live in HR Hub &mdash; to add a partner or change an agreement,{' '}
          <a href={HR_URL} target="_blank" rel="noopener noreferrer"
             style={{ color: '#12606C', fontWeight: 700, textDecoration: 'underline' }}>
            open Partner Institutions in HR Hub <ExternalLink size={11} style={{ display: 'inline', verticalAlign: -1 }} />
          </a>.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--mid-gray)' }} />
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search institution, contact, or service…"
            style={{ width: '100%', padding: '0.5rem 0.6rem 0.5rem 2rem', borderRadius: 8, border: '1px solid var(--light-gray)', fontSize: '0.85rem' }} />
        </div>
        <select value={type} onChange={e => setType(e.target.value)}
          style={{ padding: '0.5rem 0.6rem', borderRadius: 8, border: '1px solid var(--light-gray)', fontSize: '0.85rem' }}>
          <option value="all">All types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {error ? (
        <div style={{ ...card, padding: '1rem', background: '#FEF2F2', borderColor: '#FCA5A5', color: '#991B1B', fontSize: '0.85rem' }}>
          {error}
        </div>
      ) : loading && list.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--mid-gray)', padding: '3rem 0', fontSize: '0.85rem' }}>Loading…</p>
      ) : shown.length === 0 ? (
        <div style={{ ...card, padding: '2.5rem', textAlign: 'center' }}>
          <Building2 size={28} style={{ color: 'var(--light-gray)' }} />
          <p style={{ fontWeight: 600, color: 'var(--charcoal)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
            {list.length === 0 ? 'No partner institutions recorded yet' : 'Nothing matches that search'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {shown.map(i => {
            const expired = isExpired(i)
            return (
              <div key={i.id} style={{ ...card, padding: '0.9rem 1rem', opacity: expired ? 0.75 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, color: 'var(--charcoal)', fontSize: '0.95rem' }}>{i.name}</span>
                  {i.typeLabel && <span style={chip}>{i.typeLabel}</span>}
                  {expired && (
                    <span style={{ ...chip, background: '#FEE2E2', color: '#991B1B' }}>
                      Expired {fmtDate(i.effectivityTo)}
                    </span>
                  )}
                </div>

                {(i.pointOfContact || i.email || i.mobile || i.telephone) && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--mid-gray)', marginTop: '0.3rem' }}>
                    {[i.pointOfContact, i.email, i.mobile || i.telephone].filter(Boolean).join(' · ')}
                  </p>
                )}

                {i.services.length > 0 && (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: '0.5rem' }}>
                    {i.services.map(s => <span key={s.id} style={{ ...chip, background: '#EDE4FA', color: '#5B2A86' }}>{s.label}</span>)}
                  </div>
                )}

                {i.discounts.length > 0 && (
                  <div style={{ marginTop: '0.55rem', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {i.discounts.map((d, n) => (
                      <div key={`${d.serviceId}-${n}`} style={{ fontSize: '0.8rem', color: 'var(--charcoal)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Percent size={12} style={{ color: '#166534', flexShrink: 0 }} />
                        <strong>{discountLabel(d)}</strong>
                        <span style={{ color: 'var(--mid-gray)' }}>on {d.serviceLabel}</span>
                        {d.note && <span style={{ color: 'var(--mid-gray)' }}>&mdash; {d.note}</span>}
                      </div>
                    ))}
                  </div>
                )}

                {i.hasCommission && (
                  <p style={{ fontSize: '0.78rem', color: '#93460B', marginTop: '0.4rem' }}>
                    Commission: {i.commissionType === 'percent' ? `${i.commissionValue}%` : `₱${Number(i.commissionValue).toLocaleString()}`}
                    {i.commissionNote ? ` — ${i.commissionNote}` : ''}
                  </p>
                )}

                <p style={{ fontSize: '0.74rem', color: 'var(--mid-gray)', marginTop: '0.5rem' }}>
                  {i.agreementType && i.agreementType !== 'NA' ? `${i.agreementType} · ` : ''}
                  {i.effectivityFrom ? `From ${fmtDate(i.effectivityFrom)}` : 'No start date recorded'}
                  {i.effectivityTo ? ` to ${fmtDate(i.effectivityTo)}` : i.effectivityFrom ? ' · open-ended' : ''}
                  {/* Said rather than linked: the files stay in HR on purpose. */}
                  {i.hasDocument ? ' · signed document on file in HR Hub' : ''}
                  {i.photoCount > 0 ? ` · ${i.photoCount} photo${i.photoCount === 1 ? '' : 's'}` : ''}
                </p>

                {i.remarks && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--charcoal)', marginTop: '0.45rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {i.remarks}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
