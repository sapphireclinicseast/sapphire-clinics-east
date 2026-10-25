'use client'

// Right-hand panel in the Enquiries inbox: who this is, how to reach them,
// and whether they are already one of ours.
//
// Modelled on the Meta inbox's third column, but carrying what a clinic front
// desk actually needs rather than lead-capture and ad fields. The question
// asked most often about an enquiry is "are they an existing patient?", and
// before this it could only be answered by leaving the page and searching the
// CRM by hand.

import { useState } from 'react'
import { Mail, Phone, Copy, Check, User, ExternalLink, Calendar, Hash, Building2, RotateCcw } from 'lucide-react'

export interface PanelInquiry {
  id: string; ref: string; branch: string; name: string
  email: string | null; phone: string | null
  subject: string | null; status: string; createdAt: string; lastMessageAt: string
}
export interface PanelPatient {
  id: string; firstName: string; lastName: string
  patientType: string; branches: string[]
  /** false when matched on name alone — names repeat, so say so. */
  confident: boolean
}

const BRANCH_LABEL: Record<string, string> = { SBEA: 'East', SBGH: 'Greenhills' }

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?'
}

function CopyRow({ icon, value, href }: { icon: React.ReactNode; value: string; href: string }) {
  const [done, setDone] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
      <span style={{ color: '#8a9499', display: 'flex', flexShrink: 0 }}>{icon}</span>
      <a href={href} style={{
        flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--teal)', textDecoration: 'none',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{value}</a>
      <button
        type="button"
        onClick={() => { navigator.clipboard?.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500) }}
        aria-label={`Copy ${value}`}
        style={{ border: 0, background: 'transparent', cursor: 'pointer', color: done ? '#15803d' : '#b3bcc0', display: 'flex', flexShrink: 0, padding: 2 }}
      >
        {done ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '13px 15px', borderTop: '1px solid var(--light-gray)' }}>
      <p style={{
        margin: '0 0 9px', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.07em',
        textTransform: 'uppercase', color: '#9aa5a9',
      }}>{title}</p>
      {children}
    </div>
  )
}

export interface PanelHistory { id: string; ref: string; status: string; lastMessageAt: string }

export default function InquiryContactPanel({
  inquiry, patient, history = [], onToggleClosed, onOpenOther,
}: {
  inquiry: PanelInquiry
  patient: PanelPatient | null
  history?: PanelHistory[]
  onToggleClosed: () => void
  onOpenOther?: (id: string) => void
}) {
  const closed = inquiry.status === 'CLOSED'
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <aside style={{
      width: 268, flexShrink: 0, borderLeft: '1px solid var(--light-gray)',
      overflowY: 'auto', background: '#fff',
    }}>
      <div style={{ padding: '18px 15px 14px', textAlign: 'center' }}>
        <div style={{
          width: 62, height: 62, borderRadius: 999, background: 'var(--teal)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 19, fontWeight: 800, margin: '0 auto 9px',
        }}>{initials(inquiry.name)}</div>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--charcoal)' }}>{inquiry.name}</p>
        <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#8a9499' }}>
          {patient ? (patient.confident ? 'Existing patient' : 'Possible patient match') : 'Not in the patient register'}
        </p>
      </div>

      <Section title="Contact">
        {inquiry.email && <CopyRow icon={<Mail size={13} />} value={inquiry.email} href={`mailto:${inquiry.email}`} />}
        {inquiry.phone && <CopyRow icon={<Phone size={13} />} value={inquiry.phone} href={`tel:${inquiry.phone}`} />}
        {!inquiry.email && !inquiry.phone && (
          <p style={{ margin: 0, fontSize: 12, color: '#9aa5a9' }}>No contact details given.</p>
        )}
      </Section>

      <Section title="Enquiry">
        <Row icon={<Hash size={12} />} label="Reference" value={inquiry.ref} mono />
        <Row icon={<Building2 size={12} />} label="Branch" value={BRANCH_LABEL[inquiry.branch] ?? inquiry.branch} />
        <Row icon={<Calendar size={12} />} label="First message" value={fmt(inquiry.createdAt)} />
        <Row icon={<Calendar size={12} />} label="Last message" value={fmt(inquiry.lastMessageAt)} />
        {inquiry.subject && <Row icon={<Hash size={12} />} label="Subject" value={inquiry.subject} />}
      </Section>

      <Section title="Patient record">
        {patient ? (
          <>
            {/* A name-only match is a guess. Saying so matters: the alternative
                is someone opening the wrong child's record mid-conversation. */}
            {!patient.confident && (
              <p style={{
                margin: '0 0 8px', fontSize: 11.5, color: '#A16207', background: '#FEF9C3',
                border: '1px solid #FDE68A', borderRadius: 8, padding: '6px 8px', lineHeight: 1.45,
              }}>
                Matched on name only — check this is the right person before relying on it.
              </p>
            )}
            <a href={`/patients?highlight=${patient.id}`} style={{
              display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none',
              border: '1.5px solid var(--light-gray)', borderRadius: 10, padding: '9px 11px',
            }}>
              <User size={15} style={{ color: 'var(--teal)', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--charcoal)' }}>
                  {patient.firstName} {patient.lastName}
                </span>
                <span style={{ display: 'block', fontSize: 11, color: '#8a9499' }}>
                  {patient.patientType === 'PEDIATRIC' ? 'Pediatric' : 'Adult'}
                  {patient.branches.length ? ` · ${patient.branches.map(b => BRANCH_LABEL[b] ?? b).join(', ')}` : ''}
                </span>
              </span>
              <ExternalLink size={13} style={{ color: '#b3bcc0', flexShrink: 0 }} />
            </a>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 12, color: '#9aa5a9', lineHeight: 1.5 }}>
            No matching record. If they book, they&rsquo;ll need registering.
          </p>
        )}
      </Section>

      {history.length > 0 && (
        <Section title={`Earlier conversations (${history.length})`}>
          {history.map(h => (
            <button key={h.id} onClick={() => onOpenOther?.(h.id)} style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
              border: 0, background: 'transparent', cursor: onOpenOther ? 'pointer' : 'default',
              padding: '5px 0',
            }}>
              <span style={{
                flex: 1, minWidth: 0, fontSize: 11.5, color: 'var(--teal)',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}>{h.ref}</span>
              <span style={{ fontSize: 10.5, color: '#9aa5a9', flexShrink: 0 }}>
                {new Date(h.lastMessageAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
              </span>
              <span style={{ fontSize: 10, color: h.status === 'CLOSED' ? '#9aa5a9' : '#047857', flexShrink: 0 }}>
                {h.status === 'CLOSED' ? 'closed' : h.status === 'ANSWERED' ? 'replied' : 'open'}
              </span>
            </button>
          ))}
        </Section>
      )}

      <Section title="Status">
        <p style={{
          margin: '0 0 9px', display: 'inline-block', fontSize: 11.5, fontWeight: 700,
          borderRadius: 999, padding: '3px 10px',
          background: closed ? '#F3F4F6' : inquiry.status === 'ANSWERED' ? '#ECFDF5' : '#FEF9C3',
          color:      closed ? '#6B7280' : inquiry.status === 'ANSWERED' ? '#047857' : '#A16207',
        }}>
          {closed ? 'Closed' : inquiry.status === 'ANSWERED' ? 'Replied' : 'Awaiting reply'}
        </p>
        <button onClick={onToggleClosed} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%',
          cursor: 'pointer', border: '1.5px solid var(--light-gray)', background: '#fff',
          borderRadius: 10, padding: '9px 11px', fontSize: 12.5, fontWeight: 700, color: '#6b7280',
        }}>
          {closed ? <><RotateCcw size={13} /> Reopen</> : <><Check size={13} /> Mark done</>}
        </button>
        {!closed && (
          <p style={{ margin: '7px 0 0', fontSize: 11, color: '#9aa5a9', lineHeight: 1.45 }}>
            Closing stops the enquirer adding to this conversation.
          </p>
        )}
      </Section>
    </aside>
  )
}

function Row({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 7 }}>
      <span style={{ color: '#b3bcc0', display: 'flex', flexShrink: 0, marginTop: 2 }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 10.5, color: '#9aa5a9' }}>{label}</span>
        <span style={{
          display: 'block', fontSize: 12.5, color: 'var(--charcoal)', wordBreak: 'break-word',
          fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
        }}>{value}</span>
      </span>
    </div>
  )
}
