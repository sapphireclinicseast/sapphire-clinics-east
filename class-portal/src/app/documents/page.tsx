'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { submitDocuments } from '@/lib/api'
import { getSession, getDraft, setDraft, putFile, levelLabel, type EnrollmentLevel } from '@/lib/session'

interface DocRequirement {
  key: string
  title: string
  sub: string
  optional?: boolean
  /** When set, only files matching this MIME prefix are accepted. */
  imageOnly?: boolean
}

const CHILD_PHOTO_DOC: DocRequirement = {
  key: 'child_photo_1x1',
  title: 'Child’s 1x1 Photo (for student ID)',
  sub: 'Front-facing headshot, plain background, JPG or PNG. This will be used as the student’s profile photo.',
  imageOnly: true,
}

const KINDER_DOCS: DocRequirement[] = [
  { key: 'psa_birth_cert',   title: 'PSA Birth Certificate (photocopy)', sub: 'Clear scan or photo of the PSA-issued certificate.' },
  CHILD_PHOTO_DOC,
  { key: 'medical_reports',  title: 'Medical / developmental / therapy reports', sub: 'If relevant — helps the school plan support.', optional: true },
]

const GRADED_DOCS: DocRequirement[] = [
  { key: 'psa_birth_cert',     title: 'PSA Birth Certificate (photocopy)', sub: 'Clear scan or photo of the PSA-issued certificate.' },
  CHILD_PHOTO_DOC,
  { key: 'report_card_sf9',    title: 'Latest Report Card / SF9 (Form 138)', sub: 'Most recent grading period.' },
  { key: 'good_moral',         title: 'Certificate of Good Moral Character', sub: 'From the previous school.' },
  { key: 'form_137_sf10',      title: 'Form 137 / SF10 or previous school records', sub: 'Permanent record from the prior school.' },
]

export default function DocumentsPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [level, setLevel] = useState<EnrollmentLevel | null>(null)
  const [token, setToken] = useState('')
  const [files, setFiles] = useState<Record<string, File | null>>({})
  const [waiverSignedAt, setWaiverSignedAt] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const s = getSession()
    if (!s) { router.replace('/?expired=1'); return }
    setLevel(s.level); setToken(s.token)
    const draft = getDraft()
    if (draft?.waiverSignedAt) setWaiverSignedAt(draft.waiverSignedAt)
    setReady(true)
  }, [router])

  // Refresh waiver state if the user signed it in the popup and returned.
  useEffect(() => {
    function onFocus() {
      const draft = getDraft()
      if (draft?.waiverSignedAt) setWaiverSignedAt(draft.waiverSignedAt)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const docs = useMemo<DocRequirement[]>(() => {
    if (!level) return []
    return level === 'KINDER' ? KINDER_DOCS : GRADED_DOCS
  }, [level])

  function onFile(key: string, f: File | null) {
    if (f && f.size > 30 * 1024 * 1024) {
      setErr(`${f.name} is larger than 30 MB. Please upload a smaller version.`)
      return
    }
    setErr(null)
    setFiles(prev => ({ ...prev, [key]: f }))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true); setErr(null)
    const draft = getDraft()
    if (!draft?.psaBirthCertNo || !draft?.certSignatureDataUrl) {
      setErr('Missing learner profile details. Please go back and complete the profile.')
      setBusy(false); return
    }
    // Required docs (everything except docs flagged optional)
    const missing = docs.filter(d => !d.optional && !files[d.key]).map(d => d.title)
    if (missing.length) {
      setErr('Please upload: ' + missing.join(', '))
      setBusy(false); return
    }
    if (!waiverSignedAt) {
      setErr('Please sign the Parent/Guardian Waiver before submitting.')
      setBusy(false); return
    }
    try {
      const documents: Record<string, { name: string; size: number; type?: string; fileId?: string }> = {}
      for (const [k, f] of Object.entries(files)) {
        if (!f) continue
        const fileId = 'doc_' + Math.random().toString(36).slice(2, 12)
        try { await putFile(fileId, f) } catch (e) { console.warn('IndexedDB put failed', e) }
        documents[k] = { name: f.name, size: f.size, type: f.type, fileId }
      }
      await submitDocuments(token, { documents, waiverSignedAt })
      setDraft({ documents })
      router.push('/account-setup')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function openWaiver() {
    // Pop the waiver in a new window. The waiver page writes
    // `waiverSignedAt` back into the draft via `setDraft` on completion;
    // the focus listener above picks it up when this tab regains focus.
    const url = level === 'KINDER' ? '/waiver?level=KINDER' : `/waiver?level=${level}`
    window.open(url, 'scei_waiver', 'width=720,height=860,resizable=yes,scrollbars=yes')
  }

  if (!ready || !level) return null

  return (
    <div className="max-w-2xl mx-auto animate-fade-up">
      <StepBar step={3} />

      <div className="card-static">
        <h1 className="text-[26px] leading-tight text-[color:var(--deep-teal)] mb-1">Upload required documents</h1>
        <p className="text-sm text-[color:var(--mid-gray)] mb-6">
          For <span className="font-semibold text-[color:var(--narra)]">{levelLabel(level)}</span>. Accepted: PDF, JPG, PNG (max 30 MB each).
        </p>

        {err && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800 animate-fade-in">
            {err}
          </div>
        )}

        <form className="space-y-3" onSubmit={handleSubmit}>
          {docs.map(d => (
            <DocRow key={d.key} doc={d} file={files[d.key] ?? null} onFile={f => onFile(d.key, f)} />
          ))}

          {/* Parent/Guardian Waiver — special row that opens the digital sign window */}
          <div className="doc-row" style={waiverSignedAt ? { borderStyle: 'solid', borderColor: 'var(--sage)', background: 'var(--sage-tint)' } : undefined}>
            <div className="min-w-0">
              <div className="doc-row-title">Signed Parent/Guardian Waiver</div>
              <div className="doc-row-sub">
                {waiverSignedAt
                  ? <>Signed at {new Date(waiverSignedAt).toLocaleString()}.</>
                  : <>Opens a new window — sign on screen or upload an e-signature image.</>}
              </div>
            </div>
            <button type="button" className={waiverSignedAt ? 'btn-secondary' : 'btn-cta'} onClick={openWaiver}>
              {waiverSignedAt ? 'Re-sign' : 'Open waiver →'}
            </button>
          </div>

          <div className="flex items-center gap-2 pt-3">
            <button type="button" className="btn-secondary" onClick={() => router.push('/enroll')}>← Back</button>
            <button type="submit" disabled={busy} className="btn-primary flex-1">
              {busy ? 'Submitting…' : 'Submit enrollment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DocRow({ doc, file, onFile }: { doc: DocRequirement; file: File | null; onFile: (f: File | null) => void }) {
  return (
    <label className="doc-row cursor-pointer" style={file ? { borderStyle: 'solid', borderColor: 'var(--sage)', background: 'var(--sage-tint)' } : undefined}>
      <div className="min-w-0">
        <div className="doc-row-title">
          {doc.title}
          {doc.optional && <span className="ml-2 text-[10.5px] uppercase tracking-[0.12em] text-[color:var(--mid-gray)] font-semibold">optional</span>}
        </div>
        <div className="doc-row-sub">{file ? `Selected: ${file.name} (${(file.size / 1024).toFixed(0)} KB)` : doc.sub}</div>
      </div>
      <span className="btn-secondary shrink-0" style={{ pointerEvents: 'none' }}>
        {file ? 'Change' : 'Upload'}
      </span>
      <input
        type="file"
        className="hidden"
        accept={doc.imageOnly ? 'image/*' : '.pdf,image/*'}
        onChange={e => onFile(e.target.files?.[0] ?? null)}
      />
    </label>
  )
}

function StepBar({ step }: { step: 1 | 2 | 3 | 4 }) {
  const dot = (n: 1 | 2 | 3 | 4) => {
    if (n < step) return 'step-dot step-dot-done'
    if (n === step) return 'step-dot step-dot-active'
    return 'step-dot'
  }
  return (
    <div className="flex items-center justify-center gap-2 mb-6" aria-hidden>
      <span className={dot(1)} />
      <span className={dot(2)} />
      <span className={dot(3)} />
      <span className={dot(4)} />
    </div>
  )
}
