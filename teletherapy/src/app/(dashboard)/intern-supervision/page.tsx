'use client'

import { useEffect, useState } from 'react'
import { UserCog, Loader2, CheckCircle2, Clock, Calendar, Paperclip, Upload, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Intern { id: string; name: string; department: string; branch: string; startMonth: string | null; endMonth: string | null }
interface GradeInfo { grade: string; note: string | null; fileName: string | null; filePath: string | null; gradedByName: string | null; updatedAt: string }

// Upload a grade computation file with real progress (fetch has no upload
// progress event). Returns the saved attachment descriptor.
function uploadGradeFile(file: File, internId: string, onProgress: (pct: number) => void): Promise<{ fileName: string; filePath: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/upload')
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100))) }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { try { resolve(JSON.parse(xhr.responseText)) } catch { reject(new Error('Bad response')) } }
      else { let m = `Upload failed (${xhr.status})`; try { m = JSON.parse(xhr.responseText).error ?? m } catch {} reject(new Error(m)) }
    }
    xhr.onerror = () => reject(new Error('Upload failed — network error'))
    const fd = new FormData()
    fd.append('file', file)
    fd.append('folder', `intern-grades/${internId}`)
    xhr.send(fd)
  })
}

function GradeCard({ intern, existing, onSaved, onToast }: { intern: Intern; existing?: GradeInfo; onSaved: () => void; onToast: (m: string) => void }) {
  const [grade, setGrade] = useState(existing?.grade ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!grade.trim()) { onToast('Please enter a grade.'); return }
    setSaving(true)
    try {
      let fileMeta: { fileName?: string; filePath?: string; mimeType?: string } = {}
      if (file) {
        setProgress(0)
        fileMeta = await uploadGradeFile(file, intern.id, setProgress)
        setProgress(100)
      }
      const res = await fetch('/api/intern-supervision/grades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internStaffId: intern.id, grade, note, ...fileMeta }),
      })
      if (res.ok) { onToast('Grade saved'); setFile(null); onSaved() }
      else { const d = await res.json().catch(() => ({})); onToast(d.error ?? 'Failed to save') }
    } catch (e) { onToast(e instanceof Error ? e.message : 'Failed to save') }
    setSaving(false)
    setTimeout(() => setProgress(null), 600)
  }

  return (
    <div className="card-static">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div>
          <p className="font-semibold text-[var(--charcoal)] text-[14px]">{intern.name}</p>
          <p className="text-[12px] text-[var(--mid-gray)]">{intern.department} · {intern.branch}</p>
        </div>
        {existing?.updatedAt && (
          <span className="text-[11px] text-[var(--mid-gray)]">Last graded {new Date(existing.updatedAt).toLocaleDateString()}{existing.gradedByName ? ` · ${existing.gradedByName}` : ''}</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[12px] font-semibold text-[var(--charcoal)] mb-1.5">Grade</label>
          <input value={grade} onChange={(e) => setGrade(e.target.value)} className="input" placeholder="e.g. 95% or Passed" />
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-[var(--charcoal)] mb-1.5">Computation file (optional)</label>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--light-gray)] text-[13px] font-semibold text-[var(--mid-gray)] hover:border-[var(--teal)] hover:text-[var(--teal)] cursor-pointer transition-colors whitespace-nowrap">
              <Upload size={14} /> {file ? 'Change' : 'Attach'} file
              <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} onClick={(e) => { (e.currentTarget as HTMLInputElement).value = '' }} />
            </label>
            {file ? (
              <span className="text-[12px] text-[var(--charcoal)] truncate flex items-center gap-1"><Paperclip size={12} className="text-[var(--teal)]" />{file.name}</span>
            ) : existing?.filePath ? (
              <a href={`/api/upload/${existing.filePath}`} target="_blank" rel="noopener noreferrer" className="text-[12px] text-[var(--teal)] hover:underline truncate flex items-center gap-1"><FileText size={12} />{existing.fileName ?? 'file'}</a>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <label className="block text-[12px] font-semibold text-[var(--charcoal)] mb-1.5">Note (optional)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="input resize-y !rounded-xl" placeholder="Remarks…" />
      </div>

      {progress !== null && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--mid-gray)] mb-1"><span>Uploading…</span><span className="tabular-nums">{progress}%</span></div>
          <div className="h-2 rounded-full bg-[var(--light-gray)] overflow-hidden"><div className="h-full bg-[var(--teal)] transition-[width] duration-200" style={{ width: `${progress}%` }} /></div>
        </div>
      )}

      <button onClick={save} disabled={saving} className="btn-primary mt-4 px-5 py-2.5 rounded-xl text-[13px]">
        {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} {progress !== null ? `Uploading… ${progress}%` : (existing ? 'Update grade' : 'Save grade')}
      </button>
    </div>
  )
}
interface BT {
  id: string; internName: string; internStaffId: string; periodLabel: string
  answers: { question: string; answer: string }[]
  internSignedName: string; internSignedAt: string
  supervisorSignedName: string | null; supervisorSignedAt: string | null
}

type Tab = 'interns' | 'balik-tanaw' | 'grades'

export default function InternSupervisionPage() {
  const [loading, setLoading] = useState(true)
  const [interns, setInterns] = useState<Intern[]>([])
  const [bt, setBt] = useState<BT[]>([])
  const [grades, setGrades] = useState<Record<string, GradeInfo>>({})
  const [tab, setTab] = useState<Tab>('interns')
  const [signing, setSigning] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(null), 4000) }

  async function load() {
    setLoading(true)
    try {
      const [iRes, bRes, gRes] = await Promise.all([
        fetch('/api/intern-supervision/interns'),
        fetch('/api/intern-supervision/balik-tanaw'),
        fetch('/api/intern-supervision/grades'),
      ])
      if (iRes.ok) setInterns((await iRes.json()).interns ?? [])
      if (bRes.ok) setBt((await bRes.json()).entries ?? [])
      if (gRes.ok) setGrades((await gRes.json()).grades ?? {})
    } catch {}
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function sign(id: string) {
    setSigning(id)
    try {
      const res = await fetch(`/api/balik-tanaw/${id}/sign`, { method: 'POST' })
      if (res.ok) { showToast('Signed'); load() }
      else { const d = await res.json().catch(() => ({})); showToast(d.error ?? 'Failed to sign') }
    } catch { showToast('Failed to sign') }
    setSigning(null)
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-[var(--teal)] animate-spin" /></div>
  }

  const isActiveSupervisor = interns.length > 0

  return (
    <div className="max-w-4xl mx-auto">
      {toast && <div className="toast">{toast}</div>}

      <div className="hero-gradient rounded-2xl px-8 py-8 mb-8">
        <h1 className="text-xl font-bold text-white tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Intern Supervision</h1>
        <p className="text-white/60 text-sm mt-1">Interns decked to you, their Balik-Tanaw, and grades</p>
      </div>

      {!isActiveSupervisor ? (
        <div className="card-static text-center py-16">
          <div className="w-14 h-14 rounded-full bg-[var(--pale-teal)] flex items-center justify-center mx-auto mb-4">
            <UserCog size={24} className="text-[var(--teal)]" />
          </div>
          <p className="font-semibold text-[var(--charcoal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>No interns assigned</p>
          <p className="text-[13px] text-[var(--mid-gray)] max-w-md mx-auto leading-relaxed">
            Only clinicians with an active supervision will have content here. When interns are decked to you in the
            Operations Hub, they'll appear here with their Balik-Tanaw reflections and grading.
          </p>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-2 p-1 rounded-xl bg-[var(--off-white)] border border-[var(--light-gray)] mb-6">
            {([['interns', 'List of Interns'], ['balik-tanaw', 'Balik-Tanaw'], ['grades', 'Grades']] as [Tab, string][]).map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)}
                className={cn('flex-1 px-3 py-2.5 rounded-lg text-[13px] font-semibold transition-colors',
                  tab === t ? 'bg-white text-[var(--teal)] shadow-sm' : 'text-[var(--mid-gray)] hover:text-[var(--charcoal)]')}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'interns' && (
            <div className="space-y-3">
              {interns.map((i) => (
                <div key={i.id} className="card-static flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[var(--pale-teal)] flex items-center justify-center font-bold text-[var(--teal)] text-[13px]">
                      {i.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                    </div>
                    <div>
                      <p className="font-semibold text-[var(--charcoal)] text-[14px]">{i.name}</p>
                      <p className="text-[12px] text-[var(--mid-gray)]">{i.department} · {i.branch}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[12px] text-[var(--mid-gray)]">
                    <Calendar size={13} />
                    {i.startMonth || '—'} to {i.endMonth || '—'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'balik-tanaw' && (
            bt.length === 0 ? (
              <div className="card-static text-center py-12 text-[13px] text-[var(--mid-gray)]">No Balik-Tanaw reflections submitted yet.</div>
            ) : (
              <div className="space-y-3">
                {bt.map((e) => (
                  <div key={e.id} className="card-static">
                    <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                      <div>
                        <p className="font-semibold text-[var(--charcoal)] text-[14px]">{e.internName}</p>
                        <p className="text-[12px] text-[var(--mid-gray)]">{e.periodLabel}</p>
                      </div>
                      {e.supervisorSignedName ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                          <CheckCircle2 size={12} /> Signed {e.supervisorSignedAt ? new Date(e.supervisorSignedAt).toLocaleDateString() : ''}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                          <Clock size={12} /> Not yet signed
                        </span>
                      )}
                    </div>
                    <div className="space-y-3">
                      {e.answers.map((a, i) => (
                        <div key={i}>
                          <p className="text-[12px] font-semibold text-[var(--mid-gray)] mb-1">{i + 1}. {a.question}</p>
                          <p className="text-[13px] text-[var(--charcoal)] whitespace-pre-wrap">{a.answer || <span className="italic text-[var(--mid-gray)]">—</span>}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-[var(--light-gray)] flex-wrap">
                      <p className="text-[11px] text-[var(--mid-gray)]">Intern's signature: <span className="font-semibold text-[var(--charcoal)]">{e.internSignedName}</span></p>
                      {!e.supervisorSignedName && (
                        <button onClick={() => sign(e.id)} disabled={signing === e.id}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--teal)] text-white text-[13px] font-semibold hover:opacity-90 disabled:opacity-50">
                          {signing === e.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Sign as Coordinating Teacher
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {tab === 'grades' && (
            <div className="space-y-3">
              <p className="text-[12px] text-[var(--mid-gray)] mb-1">Encode each intern's grade and attach a computation file (Excel, PDF, or Word).</p>
              {interns.map((i) => (
                <GradeCard key={i.id} intern={i} existing={grades[i.id]} onSaved={load} onToast={showToast} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
