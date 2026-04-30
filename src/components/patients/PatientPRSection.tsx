'use client'

import { useEffect, useState } from 'react'
import { FileText, Eye, CheckCircle, Clock, Mail, Bell } from 'lucide-react'

interface PR {
  id: string
  fileName: string
  filePath: string
  mimeType: string
  department: string
  description: string | null
  createdAt: string
  informedFrontDeskAt: string | null
  paidForAt: string | null
  emailedToPatientAt: string | null
}

const DEPT_LABEL: Record<string, string> = {
  OT: 'OT', PT: 'PT', SLP: 'SLP', SPED: 'SPED',
  PSYCHOLOGY: 'Psychology', ORTHOSIS: 'O&P',
}

function fmt(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function PatientPRSection({ patientId }: { patientId: string }) {
  const [docs, setDocs] = useState<PR[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/patients/${patientId}/progress-reports`)
        if (res.ok && !cancelled) {
          const data = await res.json()
          setDocs(data.documents ?? [])
        }
      } catch {}
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [patientId])

  if (loading) return null

  return (
    <div className="bg-white border border-gray-200 rounded-xl mb-6 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
        <FileText size={16} className="text-[#ED6823]" />
        <h3 className="text-sm font-bold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>
          Progress Reports
        </h3>
        {docs.length > 0 && (
          <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
            {docs.length}
          </span>
        )}
      </div>
      <div className="px-5 py-4">
        {docs.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No Progress Reports uploaded yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {docs.map((doc) => {
              const sent = !!doc.emailedToPatientAt
              const paid = !!doc.paidForAt
              const informed = !!doc.informedFrontDeskAt

              return (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200 hover:border-orange-200 transition-colors"
                >
                  <FileText size={16} className="text-gray-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate" title={doc.fileName}>
                      {doc.fileName}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {DEPT_LABEL[doc.department] ?? doc.department} · uploaded {fmt(doc.createdAt)}
                    </div>
                    {/* Status timeline */}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {informed && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">
                          <Bell size={9} /> Informed · {fmt(doc.informedFrontDeskAt)}
                        </span>
                      )}
                      {paid && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                          <CheckCircle size={9} /> Paid · {fmt(doc.paidForAt)}
                        </span>
                      )}
                      {sent && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                          <Mail size={9} /> Sent · {fmt(doc.emailedToPatientAt)}
                        </span>
                      )}
                      {!sent && !paid && !informed && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                          <Clock size={9} /> Pending
                        </span>
                      )}
                    </div>
                  </div>
                  <a
                    href={`/api/progress-reports/${doc.id}/file`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-[var(--teal)] hover:bg-[rgba(26,123,138,0.08)] px-2 py-1.5 rounded-md transition-colors"
                  >
                    <Eye size={12} /> View
                  </a>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
