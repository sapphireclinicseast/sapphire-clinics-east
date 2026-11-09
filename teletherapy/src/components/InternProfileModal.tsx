'use client'

import { useEffect, useState } from 'react'
import { FileDown } from 'lucide-react'
import {
  BTN_PRIMARY, BTN_SECONDARY, Dialog, ErrorCard, GroupLabel, PRIMARY_STYLE, SECONDARY_STYLE, Skeleton, SUBTLE_BG,
} from '@/components/hub/ui'
import type { LearningProfileData } from '@/lib/learning-profile'
import { AURA_HEALTH_REHAB_LOGO, ALAGA_LOGO } from '@/lib/brand-logos'

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
  const hr = d.hr ?? {}
  const branchLabel = BRANCH_LABEL[hr.branch ?? d.intern.branch] ?? hr.branch ?? d.intern.branch
  const dept = hr.department ?? d.intern.department
  const start = fmtMonth(hr.dateHired), end = fmtMonth(hr.contractExpiry)
  const rotation = start && end ? `${start} – ${end}` : (start || end || '')
  const fact = (label: string, val?: string) => (val ? `<span class="fact">${esc(label)} <b>${esc(val)}</b></span>` : '')
  const facts = [fact('Department', dept), fact('Branch', branchLabel), fact('Rotation', rotation)].join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>Intern Profile — ${esc(d.intern.name)}</title>
<style>
  * { box-sizing: border-box; } body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color:#1f2a30; margin:0; padding:32px; }
  .doc { max-width: 720px; margin: 0 auto; }
  .brandbar { display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #2f8f7f; padding-bottom:14px; margin-bottom:18px; }
  .brandbar img.aura { height:46px; width:auto; }
  .brandbar img.alaga { height:34px; width:auto; }
  .titlebar { display:flex; justify-content:space-between; align-items:flex-start; gap:26px; margin-bottom:6px; }
  .idblock { flex:1; min-width:0; }
  h1 { font-size:23px; margin:0 0 3px; line-height:1.15; } .role { color:#2f8f7f; font-size:13.5px; font-weight:600; margin:0 0 14px; }
  .facts { display:flex; flex-wrap:wrap; gap:7px 8px; }
  .fact { background:#eef5f2; border:1px solid #d7e6e0; border-radius:999px; padding:4px 12px; font-size:11.5px; color:#4a6a63; }
  .fact b { color:#1f2a30; font-weight:700; }
  h2 { font-size:14px; text-transform:uppercase; letter-spacing:.04em; color:#2f8f7f; border-bottom:1px solid #d9e3e0; padding-bottom:6px; margin:22px 0 12px; }
  table { width:100%; border-collapse:collapse; } td { padding:5px 0; vertical-align:top; font-size:13.5px; }
  td.k { color:#5b7772; width:180px; font-weight:600; } td.v { color:#1f2a30; }
  .qa { margin-bottom:12px; } .q { font-size:12.5px; font-weight:600; color:#5b7772; margin:0 0 3px; } .a { font-size:13.5px; margin:0; white-space:pre-wrap; }
  .foot { margin-top:28px; color:#8aa; font-size:11px; }
  .photo { width:1.7in; height:1.7in; object-fit:cover; border:1px solid #ccc; border-radius:8px; flex-shrink:0; }
  @media print { body { padding:0.6in; } }
</style></head><body><div class="doc">
  <div class="brandbar">
    <img class="aura" src="${AURA_HEALTH_REHAB_LOGO}" alt="Aura Health Rehab">
    <img class="alaga" src="${ALAGA_LOGO}" alt="Alaga">
  </div>
  <div class="titlebar">
    <div class="idblock">
      <h1>${esc(d.intern.name)}</h1>
      <p class="role">Internship${branchLabel ? ` · ${esc(branchLabel)}` : ''}</p>
      <div class="facts">${facts}</div>
    </div>
    ${d.photoUrl ? `<img class="photo" src="${esc(d.photoUrl)}" alt="2x2 photo">` : ''}
  </div>
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
    <Dialog
      labelId="intern-profile-title"
      size="lg"
      eyebrow="Intern Profile"
      title={data?.intern?.name ?? 'Intern Profile'}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={BTN_SECONDARY} style={SECONDARY_STYLE}>Close</button>
          <button onClick={generatePDF} disabled={!data} className={BTN_PRIMARY} style={PRIMARY_STYLE}>
            <FileDown size={15} aria-hidden /> Generate PDF
          </button>
        </>
      }
    >
      {loading ? (
        <div className="space-y-4" aria-busy="true" role="status" aria-label="Loading profile">
          <Skeleton className="h-3 w-32" />
          <div className="flex gap-5 flex-col sm:flex-row">
            <Skeleton className="w-28 h-28 rounded-lg" />
            <div className="flex-1 space-y-2.5">
              {[0, 1, 2, 3, 4].map((n) => <Skeleton key={n} className="h-3.5" style={{ width: `${90 - n * 10}%` }} />)}
            </div>
          </div>
        </div>
      ) : !data ? (
        <ErrorCard title="Could not load this profile." />
      ) : (
        <div className="space-y-6">
          <div className="space-y-2.5">
            <GroupLabel>HR Information</GroupLabel>
            <div className="flex gap-5 flex-col sm:flex-row">
              <div className="shrink-0">
                {data.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={data.photoUrl} alt={`${data.intern.name} photo`} className="w-28 h-28 object-cover rounded-lg" style={{ border: '1px solid var(--light-gray)', background: SUBTLE_BG }} />
                ) : (
                  <div className="w-28 h-28 rounded-lg flex items-center justify-center font-bold text-2xl" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)', border: '1px solid var(--light-gray)', fontFamily: 'var(--font-display)' }}>
                    {data.intern.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                  </div>
                )}
                <p className="text-[10px] text-center mt-1" style={{ color: 'var(--mid-gray)' }}>2×2 photo</p>
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 flex-1 sm:self-start min-w-0">
                {hrRows(data).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 py-1.5 min-w-0" style={{ borderBottom: '1px solid var(--light-gray)' }}>
                    <dt className="text-[12.5px] font-semibold shrink-0" style={{ color: 'var(--mid-gray)' }}>{k}</dt>
                    <dd className="text-[12.5px] text-right min-w-0 [overflow-wrap:anywhere]" style={{ color: 'var(--charcoal)' }}>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <div className="space-y-2.5">
            <GroupLabel>Learning Outcomes &amp; Preferences</GroupLabel>
            {!lp ? (
              <p className="text-[13px] italic" style={{ color: 'var(--mid-gray)' }}>Not submitted by the intern yet.</p>
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
                    <p className="text-[12px] font-semibold mb-0.5" style={{ color: 'var(--mid-gray)' }}>{k}</p>
                    <p className="text-[13px] whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--charcoal)' }}>{v?.trim() || <span className="italic" style={{ color: 'var(--mid-gray)' }}>—</span>}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Dialog>
  )
}
