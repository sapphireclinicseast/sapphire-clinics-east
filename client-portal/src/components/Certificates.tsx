'use client'

// "Certificates" — the patient's own discharge certificates, issued by front
// desk in the HR Platform and read through by the hub.
//
// This section is deliberately warm rather than administrative. A discharge
// certificate is the end of a course of therapy, and for most families it is
// the nice thing they came to collect, not a document to file.

import { useEffect, useState } from 'react'
import { listCertificates, certificateFileUrl, type DischargeCertificateRow } from '@/lib/api'
import {
  DashCard, StatusPill, Banner, EmptyState, RowsSkeleton, Icon, BTN_PRIMARY, PRIMARY_STYLE, TR_STYLE,
} from '@/components/hub/ui'

export default function CertificatesSection({ token }: { token: string }) {
  const [rows, setRows] = useState<DischargeCertificateRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listCertificates(token)
      .then((d) => { if (!cancelled) setRows(d.certificates) })
      .catch((e) => { if (!cancelled) setErr((e as Error).message) })
    return () => { cancelled = true }
  }, [token])

  return (
    <DashCard
      title="Certificates"
      description="Certificates of discharge from your completed programmes. Open one to view or print it."
      icon={<Icon name="award" size={16} />}
      flush
    >
      {err && <div className="px-4 sm:px-5 pt-4"><Banner tone="error">{err}</Banner></div>}

      {rows == null ? (
        <RowsSkeleton rows={2} label="Loading certificates" />
      ) : rows.length === 0 ? (
        /* Not an error state: most patients are still in therapy, and this
           should read as "not yet", not as "something is missing". */
        <EmptyState
          icon="award"
          title="No certificates yet"
          hint="One appears here when you complete a programme and your therapist discharges you."
        />
      ) : (
        <ul>
          {rows.map((c, i) => <CertificateCard key={c.id} cert={c} token={token} first={i === 0} />)}
        </ul>
      )}
    </DashCard>
  )
}

function CertificateCard({ cert, token, first }: { cert: DischargeCertificateRow; token: string; first: boolean }) {
  const href = certificateFileUrl(cert.id, token)
  const signedBy = [cert.therapistName, cert.managerName].filter(Boolean).join(' · ')

  return (
    <li
      className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-x-4 gap-y-3 flex-wrap"
      style={first ? undefined : TR_STYLE}
    >
      <div className="flex items-start gap-3 min-w-0">
        <span
          aria-hidden
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}
        >
          <Icon name="award" size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold leading-snug [overflow-wrap:anywhere]" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
            {cert.service}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusPill tone="success">Discharged</StatusPill>
            <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{cert.awardedOn || cert.dischargeDate}</span>
          </div>
          {signedBy && (
            <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>{signedBy}</p>
          )}
        </div>
      </div>
      {/* A plain link, not a fetch: the token rides in the query string the way
          every other portal file URL does, so the PDF opens in the browser's
          own viewer where printing already works. */}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${BTN_PRIMARY} shrink-0 no-underline`}
        style={PRIMARY_STYLE}
      >
        <Icon name="eye" size={14} /> View / print
      </a>
    </li>
  )
}
