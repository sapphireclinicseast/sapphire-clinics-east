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

/**
 * Sentences from the agreement text that carry a figure — a percentage or a
 * peso amount.
 *
 * These are pulled out and shown first because "what do they get" is the
 * question this page is opened to answer, and today it is buried mid-paragraph.
 *
 * Deliberately the WHOLE sentence, not the number: "₱20,000 per enrolled
 * student to LBCA" is money the clinic PAYS, and "5% discount on psych services
 * for LBCA students" is one the clinic GIVES. A badge reading "₱20,000 off"
 * would be read as a discount and honoured as one. The figure is emphasised
 * inside its sentence instead, so it catches the eye without being restated as
 * something it is not.
 */
function moneySentences(remarks: string): string[] {
  if (!remarks) return []
  return remarks
    .split(/(?<=[.;])\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 0 && /\d\s*%|₱\s*[\d,]/.test(t))
}

/** The rest of the agreement text, once the figure sentences are lifted out. */
function otherSentences(remarks: string): string[] {
  if (!remarks) return []
  return remarks
    .split(/(?<=[.;])\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 0 && !/\d\s*%|₱\s*[\d,]/.test(t))
}

/** Bold just the figures inside a sentence, leaving the wording intact. */
function withFiguresBold(text: string): React.ReactNode[] {
  const parts = text.split(/(\d+(?:\.\d+)?\s*%|₱\s*[\d,]+(?:\.\d+)?)/g)
  return parts.map((part, i) =>
    /^(\d+(?:\.\d+)?\s*%|₱\s*[\d,]+(?:\.\d+)?)$/.test(part)
      ? <strong key={i} style={{ color: '#166534', fontSize: '0.95em' }}>{part}</strong>
      : <span key={i}>{part}</span>)
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
      {/* The two-column card needs a media query, which inline styles cannot
          express — below 820px the contact column would squeeze the entitlement
          text into a ribbon. */}
      <style>{`
        @media (max-width: 820px) {
          .pi-card { grid-template-columns: 1fr !important; }
          .pi-card > div:first-child {
            border-right: none !important;
            border-bottom: 1px solid var(--light-gray);
          }
        }
      `}</style>
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
              <div key={i.id} style={{ ...card, opacity: expired ? 0.75 : 1, overflow: 'hidden' }}>
                {/* Two columns: who to contact on the left, what they get on the
                    right. The entitlement is the thing front desk open this page
                    for, so it gets the wider half and its own panel instead of
                    being the tail of a paragraph. Collapses to one column on a
                    narrow screen. */}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) 1fr', gap: 0, alignItems: 'stretch' }}
                     className="pi-card">
                  {/* ── Left: who they are, who to call ── */}
                  <div style={{ padding: '0.9rem 1rem', borderRight: '1px solid var(--light-gray)', background: '#FCFDFD' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, color: 'var(--charcoal)', fontSize: '0.95rem', lineHeight: 1.25 }}>{i.name}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: '0.35rem' }}>
                      {i.typeLabel && <span style={chip}>{i.typeLabel}</span>}
                      {expired && (
                        <span style={{ ...chip, background: '#FEE2E2', color: '#991B1B' }}>
                          Expired {fmtDate(i.effectivityTo)}
                        </span>
                      )}
                    </div>

                    {(i.pointOfContact || i.email || i.mobile || i.telephone) ? (
                      <div style={{ marginTop: '0.7rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <p style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--mid-gray)', textTransform: 'uppercase' }}>Contact</p>
                        {i.pointOfContact && <p style={{ fontSize: '0.82rem', color: 'var(--charcoal)', fontWeight: 600 }}>{i.pointOfContact}</p>}
                        {/* Clickable: the desk is usually mid-call when they look. */}
                        {i.email && <a href={`mailto:${i.email}`} style={{ fontSize: '0.78rem', color: 'var(--teal)', wordBreak: 'break-all' }}>{i.email}</a>}
                        {(i.mobile || i.telephone) && (
                          <a href={`tel:${(i.mobile || i.telephone).replace(/\s+/g, '')}`} style={{ fontSize: '0.78rem', color: 'var(--teal)' }}>
                            {i.mobile || i.telephone}
                          </a>
                        )}
                      </div>
                    ) : (
                      <p style={{ fontSize: '0.76rem', color: 'var(--mid-gray)', marginTop: '0.7rem', fontStyle: 'italic' }}>No contact recorded</p>
                    )}

                    <div style={{ marginTop: '0.7rem' }}>
                      <p style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--mid-gray)', textTransform: 'uppercase' }}>Agreement</p>
                      <p style={{ fontSize: '0.76rem', color: 'var(--mid-gray)', lineHeight: 1.5, marginTop: 2 }}>
                        {i.agreementType && i.agreementType !== 'NA' ? <>{i.agreementType}<br /></> : null}
                        {i.effectivityFrom ? `From ${fmtDate(i.effectivityFrom)}` : 'No start date recorded'}
                        {i.effectivityTo ? ` to ${fmtDate(i.effectivityTo)}` : i.effectivityFrom ? ' · open-ended' : ''}
                        {i.hasDocument ? <><br />Signed document on file in HR Hub</> : null}
                        {i.photoCount > 0 ? <><br />{i.photoCount} photo{i.photoCount === 1 ? '' : 's'}</> : null}
                      </p>
                    </div>
                  </div>

                  {/* ── Right: what they are entitled to ── */}
                  <div style={{ padding: '0.9rem 1rem' }}>
                    {i.services.length > 0 && (
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                        {i.services.map(s => <span key={s.id} style={{ ...chip, background: '#EDE4FA', color: '#5B2A86' }}>{s.label}</span>)}
                      </div>
                    )}

                    {/* Structured discounts are the good case — an exact figure
                        against an exact service. None of the seven records carry
                        them yet, so this is usually empty and the sentences
                        below carry the weight. */}
                    {i.discounts.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: '0.6rem' }}>
                        {i.discounts.map((d, n) => (
                          <span key={`${d.serviceId}-${n}`}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#DCFCE7', color: '#166534',
                                     border: '1px solid #86EFAC', borderRadius: 8, padding: '4px 9px', fontSize: '0.82rem', fontWeight: 800 }}>
                            <Percent size={12} />{discountLabel(d)}
                            <span style={{ fontWeight: 600 }}>on {d.serviceLabel}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {(() => {
                      const money = moneySentences(i.remarks)
                      const rest = otherSentences(i.remarks)
                      return (
                        <>
                          {money.length > 0 ? (
                            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '0.6rem 0.75rem' }}>
                              <p style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.06em', color: '#166534', textTransform: 'uppercase', marginBottom: 4 }}>
                                What the agreement says on rates
                              </p>
                              {money.map((t, n) => (
                                <p key={n} style={{ fontSize: '0.84rem', color: '#14532D', lineHeight: 1.55, marginTop: n ? 5 : 0 }}>
                                  {withFiguresBold(t)}
                                </p>
                              ))}
                            </div>
                          ) : i.discounts.length === 0 && (
                            <div style={{ background: '#FFF7E6', border: '1px solid #F3D9A5', borderRadius: 8, padding: '0.6rem 0.75rem' }}>
                              <p style={{ fontSize: '0.8rem', color: '#8A5A00', lineHeight: 1.5 }}>
                                No discount or rate recorded for this partner. Check the agreement in HR Hub before promising one.
                              </p>
                            </div>
                          )}

                          {rest.length > 0 && (
                            <p style={{ fontSize: '0.79rem', color: 'var(--mid-gray)', marginTop: '0.6rem', lineHeight: 1.55 }}>
                              {rest.join(' ')}
                            </p>
                          )}
                        </>
                      )
                    })()}

                    {i.hasCommission && (
                      <p style={{ fontSize: '0.78rem', color: '#93460B', marginTop: '0.5rem' }}>
                        Commission: {i.commissionType === 'percent' ? `${i.commissionValue}%` : `₱${Number(i.commissionValue).toLocaleString()}`}
                        {i.commissionNote ? ` — ${i.commissionNote}` : ''}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
