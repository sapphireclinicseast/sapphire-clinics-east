'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getSession, getDraft, clearDraft, clearSession,
  addUser, signIn, levelLabel,
  getFile, saveHeadshot, syncLocalDocsToServer,
} from '@/lib/session'

type Phase = 'password' | 'choose'

export default function AccountSetupPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('password')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [email, setEmail] = useState('')
  const [studentName, setStudentName] = useState('')

  useEffect(() => {
    const s = getSession()
    if (!s) { router.replace('/?expired=1'); return }
    const d = getDraft()
    if (!d?.email) {
      // No enrollment in progress — bounce them home.
      router.replace('/')
      return
    }
    setEmail(d.email)
    setStudentName([d.firstName, d.lastName].filter(Boolean).join(' ') || 'your student')
    setReady(true)
  }, [router])

  async function handleSetPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true); setErr(null)
    const f = new FormData(e.currentTarget)
    const password = String(f.get('password') ?? '')
    const confirm = String(f.get('confirm') ?? '')
    if (password.length < 6) { setErr('Password must be at least 6 characters.'); setBusy(false); return }
    if (password !== confirm) { setErr('Passwords do not match.'); setBusy(false); return }
    try {
      const s = getSession()
      const d = getDraft()
      if (!s || !d) { setErr('Session lost. Please restart enrollment.'); setBusy(false); return }
      const user = await addUser({
        role: 'STUDENT',
        email: d.email!,
        password,
        firstName: d.firstName,
        lastName: d.lastName,
        level: s.level,
        branch: d.branch,
        enrollment: d,
      })
      // Sign the new student in immediately so subsequent API calls authenticate.
      await signIn('STUDENT', user.email, password)
      // If the parent uploaded a 1x1 child photo during enrollment, mirror
      // it as the student's headshot so the profile shows a face immediately.
      const photoFileId = d.documents?.child_photo_1x1?.fileId
      if (photoFileId) {
        await syncHeadshotFromPhoto(user.id, photoFileId)
      }
      // Push every enrollment document up to the server now that we
      // finally have a JWT. The /documents page tries this earlier
      // (best-effort) but the parent had no token at that point, so
      // uploadDocumentBlob silently no-ops. Without this catch-up,
      // every doc the parent uploaded lives only in this device's
      // IndexedDB — the main admin viewing the new student from her
      // own laptop can't pull the bytes.
      if (d.documents && Object.keys(d.documents).length > 0) {
        try { await syncLocalDocsToServer(user.id, d.documents) } catch (e) { console.warn('doc sync failed', e) }
      }
      setPhase('choose')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!ready) return null

  if (phase === 'choose') {
    return (
      <div className="max-w-2xl mx-auto animate-fade-up">
        <StepBar step={4} />
        <div className="card-static">
          <div className="inline-flex w-14 h-14 rounded-full bg-[color:var(--sage-tint)] items-center justify-center mb-4 text-[color:var(--moss)] text-2xl">✓</div>
          <h1 className="text-[26px] leading-tight text-[color:var(--deep-teal)] mb-2">Account created</h1>
          <p className="text-sm text-[color:var(--mid-gray)] mb-6">
            You can sign in any time with <span className="font-semibold text-[color:var(--narra)]">{email}</span> and your new password. What would you like to do next?
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <button
              className="btn-cta"
              onClick={() => router.push('/pay')}
            >Pay tuition fee →</button>
            <button
              className="btn-secondary"
              onClick={() => router.push('/profile')}
            >Go to my profile</button>
          </div>
          <p className="text-[11px] text-[color:var(--mid-gray)] text-center mt-4" style={{ fontFamily: 'var(--font-display)' }}>
            Tuition payment is not yet available — this is a placeholder.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto animate-fade-up">
      <StepBar step={4} />
      <div className="card-static">
        <h1 className="text-[26px] leading-tight text-[color:var(--deep-teal)] mb-1">Create your password</h1>
        <p className="text-sm text-[color:var(--mid-gray)] mb-6">
          Documents received for <span className="font-semibold text-[color:var(--narra)]">{studentName}</span>. Set a password so you can sign back in later — your email is <span className="font-semibold text-[color:var(--narra)]">{email}</span>.
        </p>

        {err && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800 animate-fade-in">
            {err}
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSetPassword}>
          <label className="block">
            <span className="label">Password</span>
            <input required type="password" name="password" className="input" autoComplete="new-password" minLength={6} autoFocus />
          </label>
          <label className="block">
            <span className="label">Confirm password</span>
            <input required type="password" name="confirm" className="input" autoComplete="new-password" minLength={6} />
          </label>
          <button type="submit" disabled={busy} className="btn-primary w-full mt-2">
            {busy ? 'Saving…' : 'Save password & continue'}
          </button>
          <p className="text-[11px] text-[color:var(--mid-gray)] text-center" style={{ fontFamily: 'var(--font-display)' }}>
            Minimum 6 characters.
          </p>
        </form>

        <button
          type="button"
          className="block mt-6 mx-auto text-xs text-[color:var(--mid-gray)] hover:text-[color:var(--narra)] underline-offset-2 hover:underline"
          onClick={() => { clearDraft(); clearSession(); router.push('/') }}
        >
          Cancel enrollment
        </button>
      </div>
    </div>
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

/**
 * Read the 1x1 child photo blob, downsample to ≤500 px on the longer edge,
 * and save the resulting dataUrl as the student's headshot. Falls back
 * gracefully if the source is too large or canvas/Image isn't available.
 */
async function syncHeadshotFromPhoto(studentId: string, fileId: string): Promise<void> {
  try {
    const blob = await getFile(fileId)
    if (!blob) return
    // Accept anything decodable — older IndexedDB-stored files have
    // empty .type on Safari for HEIC. The canvas pipeline below will
    // tell us if it's truly an image.
    const dataUrl = await downscale(blob, 500, 0.85)
    if (!dataUrl) return
    saveHeadshot({ studentId, dataUrl, uploadedAt: new Date().toISOString(), source: '1x1' })
  } catch (e) {
    console.warn('headshot sync failed', e)
  }
}

function downscale(blob: Blob, maxEdge: number, jpegQuality: number): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      try {
        const longer = Math.max(img.width, img.height)
        const scale = longer > maxEdge ? maxEdge / longer : 1
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) { URL.revokeObjectURL(url); resolve(null); return }
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', jpegQuality))
      } catch { resolve(null) }
      finally { URL.revokeObjectURL(url) }
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}
