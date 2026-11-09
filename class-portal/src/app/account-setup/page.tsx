'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getSession, getDraft, clearDraft, clearSession,
  addUser, signIn,
  getFile, saveHeadshot, syncLocalDocsToServer,
} from '@/lib/session'
import {
  Banner, Icon, PageHeader, type IconName,
  BTN_PRIMARY, BTN_SM, CARD_STYLE, CONTROL, CONTROL_STYLE, FOCUS, LABEL, LABEL_STYLE, PRIMARY_STYLE, SUBTLE_BG,
} from '@/components/hub/ui'

type Phase = 'password' | 'choose'

export default function AccountSetupPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('password')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [email, setEmail] = useState('')
  const [studentName, setStudentName] = useState('')
  // Mirrors of the two password fields, for the live checks only — the
  // submit handler still reads them from the form.
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)

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
      <div className="max-w-2xl mx-auto animate-fade-up space-y-5 min-w-0">
        <StepBar step={4} />
        <section className="rounded-2xl px-6 py-7 sm:px-8 sm:py-8 text-center" style={{ ...CARD_STYLE, boxShadow: CARD_SHADOW }}>
          <span className="inline-flex w-14 h-14 rounded-2xl items-center justify-center mb-4" style={{ background: '#EEF5E8', color: '#2F5A28' }}>
            <Icon name="check" size={28} />
          </span>
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--deep-teal)', fontFamily: 'var(--font-display)' }}>
            Enrollment complete
          </p>
          <h1 className="text-[22px] sm:text-2xl font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            Account created
          </h1>
          <p className="text-sm mt-2 max-w-md mx-auto leading-relaxed" style={{ color: 'var(--mid-gray)' }}>
            Sign in any time with <span className="font-semibold [overflow-wrap:anywhere]" style={{ color: 'var(--charcoal)' }}>{email}</span> and your new password. What would you like to do next?
          </p>

          <div className="grid sm:grid-cols-2 gap-3 mt-6 text-left">
            <NextStep
              icon="wallet"
              title="Pay tuition fee"
              hint="Card, e-wallet, bank deposit or front desk"
              primary
              onClick={() => router.push('/pay')}
            />
            <NextStep
              icon="student"
              title="Go to my profile"
              hint="Enrollment details, documents and class info"
              onClick={() => router.push('/profile')}
            />
          </div>
        </section>
      </div>
    )
  }

  const longEnough = pw.length >= 6
  const matches = pw2.length > 0 && pw === pw2

  return (
    <div className="max-w-xl mx-auto animate-fade-up space-y-5 min-w-0">
      <StepBar step={4} />

      <PageHeader
        eyebrow="Enrollment · Step 4 of 4"
        title="Create your password"
        description="Last step. Set a password so you can sign back in to see classes, grades and payments."
      />

      <section className="rounded-xl min-w-0" style={CARD_STYLE}>
        {/* Who this account is for */}
        <div className="px-4 sm:px-5 py-3.5 grid sm:grid-cols-2 gap-x-6 gap-y-2.5 text-sm rounded-t-xl"
          style={{ background: SUBTLE_BG, borderBottom: '1px solid var(--light-gray)' }}>
          <div className="min-w-0">
            <div className={LABEL} style={LABEL_STYLE}>Student</div>
            <div className="flex items-center gap-1.5 font-semibold min-w-0" style={{ color: 'var(--charcoal)' }}>
              <Icon name="check" size={14} style={{ color: '#2F5A28' }} />
              <span className="truncate">{studentName}</span>
            </div>
            <div className="text-[12px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>Documents received</div>
          </div>
          <div className="min-w-0">
            <div className={LABEL} style={LABEL_STYLE}>Sign-in email</div>
            <div className="font-semibold [overflow-wrap:anywhere]" style={{ color: 'var(--charcoal)' }}>{email}</div>
            <div className="text-[12px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>Signs in as Parent / Student</div>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {err && (
            <div className="mb-4 animate-fade-in">
              <Banner tone="error">{err}</Banner>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSetPassword}>
            <div>
              <label htmlFor="setup-password" className={LABEL} style={LABEL_STYLE}>Password</label>
              <div className="relative">
                <input id="setup-password" required type={show ? 'text' : 'password'} name="password"
                  className={`${CONTROL} w-full h-10 pr-11`} style={CONTROL_STYLE}
                  autoComplete="new-password" minLength={6} autoFocus
                  value={pw} onChange={e => setPw(e.target.value)} />
                <ShowToggle show={show} onToggle={() => setShow(v => !v)} />
              </div>
            </div>
            <div>
              <label htmlFor="setup-confirm" className={LABEL} style={LABEL_STYLE}>Confirm password</label>
              <div className="relative">
                <input id="setup-confirm" required type={show ? 'text' : 'password'} name="confirm"
                  className={`${CONTROL} w-full h-10 pr-11`} style={CONTROL_STYLE}
                  autoComplete="new-password" minLength={6}
                  value={pw2} onChange={e => setPw2(e.target.value)} />
                <ShowToggle show={show} onToggle={() => setShow(v => !v)} />
              </div>
            </div>

            <ul className="space-y-1" aria-label="Password checks">
              <Rule ok={longEnough}>At least 6 characters</Rule>
              <Rule ok={matches}>Both passwords match</Rule>
            </ul>

            <button type="submit" disabled={busy} className={`${BTN_PRIMARY} w-full h-10`} style={PRIMARY_STYLE}>
              {busy ? 'Saving…' : <>Save password &amp; continue <Icon name="chevronRight" size={16} /></>}
            </button>
          </form>
        </div>

        <div className="px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2 text-[12px] rounded-b-xl"
          style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG, color: 'var(--mid-gray)' }}>
          <span>Changed your mind? Cancelling clears this enrollment from this device.</span>
          <button
            type="button"
            className={`${BTN_SM}`}
            style={{ color: 'var(--mid-gray)' }}
            onClick={() => { clearDraft(); clearSession(); router.push('/') }}
          >
            Cancel enrollment
          </button>
        </div>
      </section>
    </div>
  )
}

const CARD_SHADOW = '0 1px 2px rgba(30,56,50,0.04), 0 12px 32px -18px rgba(30,56,50,0.25)'

function NextStep({ icon, title, hint, primary = false, onClick }: {
  icon: IconName; title: string; hint: string; primary?: boolean; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-[opacity,background-color] ${primary ? 'hover:opacity-95' : 'hover:bg-[#FBF9F5]'} ${FOCUS}`}
      style={primary
        ? { background: 'var(--deep-teal)', color: '#fff', border: '1px solid var(--deep-teal)' }
        : { background: '#fff', color: 'var(--charcoal)', border: '1px solid var(--light-gray)' }}
    >
      <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={primary ? { background: 'rgba(255,255,255,0.16)' } : { background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
        <Icon name={icon} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>{title}</span>
        <span className="block text-[12px] mt-0.5 leading-snug" style={{ color: primary ? 'rgba(255,255,255,0.8)' : 'var(--mid-gray)' }}>{hint}</span>
      </span>
      <Icon name="chevronRight" size={16} className="transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}

function ShowToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={show ? 'Hide passwords' : 'Show passwords'}
      aria-pressed={show}
      className={`absolute right-1 top-1 w-8 h-8 rounded-md flex items-center justify-center transition-colors hover:bg-[color:var(--paper)] ${FOCUS}`}
      style={{ color: show ? 'var(--teal)' : 'var(--mid-gray)' }}
    >
      <Icon name="eye" size={16} />
    </button>
  )
}

/** Live checklist line: icon + text, never colour alone. */
function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5 text-[12px]" style={{ color: ok ? '#2F5A28' : 'var(--mid-gray)' }}>
      {ok
        ? <Icon name="check" size={14} />
        : <span aria-hidden className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ border: '1.5px solid var(--light-gray)' }} />}
      <span>{children}</span>
      <span className="sr-only">{ok ? '(done)' : '(not yet)'}</span>
    </li>
  )
}

function StepBar({ step }: { step: 1 | 2 | 3 | 4 }) {
  const dot = (n: 1 | 2 | 3 | 4) => {
    if (n < step) return 'step-dot step-dot-done'
    if (n === step) return 'step-dot step-dot-active'
    return 'step-dot'
  }
  return (
    <div className="flex items-center justify-center gap-2" aria-hidden>
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
