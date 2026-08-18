'use client'

import { useEffect, useState } from 'react'
import { X, Loader2, FileDown } from 'lucide-react'
import type { LearningProfileData } from '@/lib/learning-profile'

interface ProfileData {
  intern: { id: string; name: string; department: string; branch: string }
  hr: Record<string, string> | null
  photoUrl: string | null
  learningProfile: LearningProfileData | null
  learningUpdatedAt: string | null
}

const BRANCH_LABEL: Record<string, string> = {
  SBEA: 'Aura Health East', SANDBOX_EAST: 'Aura Health East',
  SBGH: 'Aura Health Greenhills', SANDBOX_GREENHILLS: 'Aura Health Greenhills',
}
const fmtMonth = (d?: string) => { if (!d) return ''; const t = new Date(d); return isNaN(t.getTime()) ? '' : t.toLocaleString('en-US', { month: 'long', year: 'numeric' }) }
const fmtDate = (d?: string) => { if (!d) return ''; const t = new Date(d); return isNaN(t.getTime()) ? '' : t.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) }
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Ordered (label, value) rows from the HR record.
function hrRows(d: ProfileData): [string, string][] {
  const hr = d.hr ?? {}
  const branch = BRANCH_LABEL[hr.branch ?? d.intern.branch] ?? hr.branch ?? d.intern.branch
  return ([
    ['Department', hr.department ?? d.intern.department],
    ['Branch', branch],
    ['Job Title', hr.jobTitle],
    ['Email', hr.email],
    ['Phone', hr.phone],
    ['Birthday', fmtDate(hr.birthday)],
    ['Sex', hr.sex ? hr.sex.charAt(0).toUpperCase() + hr.sex.slice(1) : ''],
    ['School', hr.school ?? hr.schoolAttended],
    ['Internship Start', fmtMonth(hr.dateHired)],
    ['Internship End', fmtMonth(hr.contractExpiry)],
  ] as [string, string][]).filter(([, v]) => v)
}

const list = (arr?: string[], other?: string) => {
  const all = [...(arr ?? []), ...(other?.trim() ? [`Others: ${other.trim()}`] : [])]
  return all.length ? all.join(', ') : '—'
}

function buildPrintHTML(d: ProfileData): string {
  const lp = d.learningProfile
  const rows = hrRows(d).map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>`).join('')
  const outcome = (q: string, a?: string) => `<div class="qa"><p class="q">${esc(q)}</p><p class="a">${esc(a?.trim() || '—')}</p></div>`
  const pref = (label: string, val: string) => `<div class="qa"><p class="q">${esc(label)}</p><p class="a">${esc(val)}</p></div>`
  return `<!doctype html><html><head><meta charset="utf-8"><title>Intern Profile — ${esc(d.intern.name)}</title>
<style>
  * { box-sizing: border-box; } body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color:#1f2a30; margin:0; padding:32px; }
  .doc { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 22px; margin:0 0 2px; } .sub { color:#5b7772; font-size:13px; margin:0 0 20px; }
  h2 { font-size:14px; text-transform:uppercase; letter-spacing:.04em; color:#2f8f7f; border-bottom:1px solid #d9e3e0; padding-bottom:6px; margin:24px 0 12px; }
  table { width:100%; border-collapse:collapse; } td { padding:5px 0; vertical-align:top; font-size:13.5px; }
  td.k { color:#5b7772; width:180px; font-weight:600; } td.v { color:#1f2a30; }
  .qa { margin-bottom:12px; } .q { font-size:12.5px; font-weight:600; color:#5b7772; margin:0 0 3px; } .a { font-size:13.5px; margin:0; white-space:pre-wrap; }
  .foot { margin-top:28px; color:#8aa; font-size:11px; }
  .photo { float:right; width:1.9in; height:1.9in; object-fit:cover; border:1px solid #ccc; border-radius:6px; margin:0 0 12px 18px; }
  @media print { body { padding:0.6in; } }
</style></head><body><div class="doc">
  ${d.photoUrl ? `<img class="photo" src="${esc(d.photoUrl)}" alt="2x2 photo">` : ''}
  <h1>Intern Profile</h1>
  <p class="sub">${esc(d.intern.name)} · Aura Health Rehab</p>
  <h2>HR Information</h2>
  <table>${rows}</table>
  ${lp ? `
  <h2>Learning Outcomes</h2>
  ${outcome('Expectations for the clinical rotation', lp.outcomes?.expectations)}
  ${outcome('Most looking forward to learning', lp.outcomes?.lookingForward)}
  ${outcome('Wants to improve on', lp.outcomes?.improve)}
  <h2>Learning Preferences</h2>
  ${pref('Learns best by', list(lp.learnBest, lp.learnBestOther))}
  ${pref('Preferred feedback', list(lp.feedback, lp.feedbackOther))}
  ${pref('Prepares for duty by', list(lp.prep))}
  ${outcome('Challenges in learning', lp.challenges)}
  ` : '<h2>Learning Outcomes &amp; Preferences</h2><p style="font-size:13px;color:#8aa">Not submitted by the intern yet.</p>'}
  <p class="foot">Generated ${new Date().toLocaleString()}</p>
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
</body></html>`
}

export default function InternProfileModal({ internId, onClose }: { internId: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ProfileData | null>(null)

  useEffect(() => {
    let ok = true
    fetch(`/api/intern-supervision/interns/${internId}/profile`)
      .then((r) => r.json()).then((d) => { if (ok) { setData(d); setLoading(false) } })
      .catch(() => { if (ok) setLoading(false) })
    return () => { ok = false }
  }, [internId])

  function generatePDF() {
    if (!data) return
    const w = window.open('', '_blank', 'width=820,height=1000')
    if (!w) return
    w.document.write(buildPrintHTML(data))
    w.document.close()
  }

  const lp = data?.learningProfile

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[88vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 mb-4 pb-4 border-b border-[var(--light-gray)]">
          <h2 className="font-bold text-[var(--charcoal)] text-[17px]" style={{ fontFamily: 'var(--font-display)' }}>
            Intern Profile{data ? ` — ${data.intern.name}` : ''}
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={generatePDF} disabled={!data}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--teal)] text-white text-[13px] font-semibold hover:opacity-90 disabled:opacity-50">
              <FileDown size={15} /> Generate PDF
            </button>
            <button onClick={onClose} className="p-1.5 text-[var(--mid-gray)] hover:text-[var(--charcoal)]"><X size={18} /></button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-[var(--teal)] animate-spin" /></div>
        ) : !data ? (
          <p className="text-[13px] text-[var(--mid-gray)] py-8 text-center">Could not load this profile.</p>
        ) : (
          <div className="space-y-6">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--teal)] mb-2">HR Information</p>
              <div className="flex gap-5 flex-col sm:flex-row">
                <div className="shrink-0">
                  {data.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={data.photoUrl} alt={`${data.intern.name} photo`} className="w-28 h-28 object-cover rounded-lg border border-[var(--light-gray)] bg-[var(--off-white)]" />
                  ) : (
                    <div className="w-28 h-28 rounded-lg bg-[var(--pale-teal)] flex items-center justify-center text-[var(--teal)] font-bold text-2xl border border-[var(--light-gray)]">
                      {data.intern.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                    </div>
                  )}
                  <p className="text-[10px] text-center text-[var(--mid-gray)] mt-1">2×2 photo</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 flex-1 self-start">
                  {hrRows(data).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 border-b border-[var(--light-gray)]/60 py-1">
                      <span className="text-[12.5px] font-semibold text-[var(--mid-gray)]">{k}</span>
                      <span className="text-[12.5px] text-[var(--charcoal)] text-right">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--teal)] mb-2">Learning Outcomes &amp; Preferences</p>
              {!lp ? (
                <p className="text-[13px] text-[var(--mid-gray)] italic">Not submitted by the intern yet.</p>
              ) : (
                <div className="space-y-3">
                  {([
                    ['Expectations for the clinical rotation', lp.outcomes?.expectations],
                    ['Most looking forward to learning', lp.outcomes?.lookingForward],
                    ['Wants to improve on', lp.outcomes?.improve],
                    ['Learns best by', list(lp.learnBest, lp.learnBestOther)],
                    ['Preferred feedback', list(lp.feedback, lp.feedbackOther)],
                    ['Prepares for duty by', list(lp.prep)],
                    ['Challenges in learning', lp.challenges],
                  ] as [string, string | undefined][]).map(([k, v]) => (
                    <div key={k}>
                      <p className="text-[12px] font-semibold text-[var(--mid-gray)] mb-0.5">{k}</p>
                      <p className="text-[13px] text-[var(--charcoal)] whitespace-pre-wrap">{v?.trim() || <span className="italic text-[var(--mid-gray)]">—</span>}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
