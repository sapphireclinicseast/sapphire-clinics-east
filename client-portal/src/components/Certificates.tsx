'use client'

// "Certificates" — the patient's own discharge certificates, issued by front
// desk in the HR Platform and read through by the hub.
//
// This section is deliberately warm rather than administrative. A discharge
// certificate is the end of a course of therapy, and for most families it is
// the nice thing they came to collect, not a document to file.

import { useEffect, useState } from 'react'
import { listCertificates, certificateFileUrl, type DischargeCertificateRow } from '@/lib/api'

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
    <div className="card-static">
      <h3 className="text-[20px] leading-tight text-[color:var(--deep-teal)]">Certificates</h3>
      <p className="text-sm text-[color:var(--mid-gray)] mt-1">
        Certificates of discharge from your completed programmes. Open one to view or print it.
      </p>

      {err && (
        <div className="mt-4 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
          {err}
        </div>
      )}

      <div className="mt-5 space-y-3">
        {rows == null ? (
          <p className="text-sm text-[color:var(--mid-gray)]">Loading…</p>
        ) : rows.length === 0 ? (
          /* Not an error state: most patients are still in therapy, and this
             should read as "not yet", not as "something is missing". */
          <div className="rounded-xl border border-dashed border-[color:var(--light-gray)] px-4 py-8 text-center">
            <p className="text-sm text-[color:var(--mid-gray)]">
              No certificates yet. One appears here when you complete a programme and your
              therapist discharges you.
            </p>
          </div>
        ) : (
          rows.map((c) => <CertificateCard key={c.id} cert={c} token={token} />)
        )}
      </div>
    </div>
  )
}

function CertificateCard({ cert, token }: { cert: DischargeCertificateRow; token: string }) {
  const href = certificateFileUrl(cert.id, token)
  const signedBy = [cert.therapistName, cert.managerName].filter(Boolean).join(' · ')

  return (
    <div className="rounded-xl border border-[color:var(--light-gray)] bg-white px-4 py-3.5 flex items-center justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <p className="font-semibold text-[color:var(--deep-teal)] text-[15px] leading-snug">
          {cert.service}
        </p>
        <p className="text-sm text-[color:var(--mid-gray)] mt-0.5">
          Discharged {cert.awardedOn || cert.dischargeDate}
        </p>
        {signedBy && (
          <p className="text-xs text-[color:var(--mid-gray)] mt-0.5 opacity-80">{signedBy}</p>
        )}
      </div>
      {/* A plain link, not a fetch: the token rides in the query string the way
          every other portal file URL does, so the PDF opens in the browser's
          own viewer where printing already works. */}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-primary shrink-0 no-underline"
      >
        View / print
      </a>
    </div>
  )
}
