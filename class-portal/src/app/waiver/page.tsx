'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { setDraft, levelLabel, type EnrollmentLevel } from '@/lib/session'
import SignaturePad from '@/components/SignaturePad'

// Placeholder waiver page. The real waiver template (text + layout) will be
// dropped into <WaiverBody /> below. The signature capture and the post-sign
// handoff back to the main tab are already wired.

export default function WaiverPage() {
  return (
    <Suspense fallback={null}>
      <WaiverInner />
    </Suspense>
  )
}

function WaiverInner() {
  const sp = useSearchParams()
  const levelParam = (sp.get('level') ?? 'KINDER') as EnrollmentLevel

  const [signatureDataUrl, setSignatureDataUrl] = useState('')
  const [signed, setSigned] = useState(false)

  function handleSign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const parentName = String(f.get('parentName') ?? '').trim()
    if (!parentName) { alert('Please type your full name to confirm.'); return }
    if (!signatureDataUrl) { alert('Please draw or upload your signature.'); return }

    const signedAt = new Date().toISOString()
    // Write back to the same-origin localStorage so the documents tab picks it up on focus.
    setDraft({ waiverSignedAt: signedAt })
    try {
      localStorage.setItem('scei_class_waiver_signature_v1', JSON.stringify({
        parentName, signedAt, signature: signatureDataUrl, level: levelParam,
      }))
    } catch { /* ignore quota */ }

    setSigned(true)
  }

  if (signed) {
    return (
      <div className="max-w-xl mx-auto py-16 px-5 text-center animate-fade-up">
        <div className="inline-flex w-14 h-14 rounded-full bg-[color:var(--sage-tint)] items-center justify-center mb-4 text-[color:var(--moss)] text-2xl">✓</div>
        <h1 className="text-[26px] leading-tight mb-2">Waiver signed</h1>
        <p className="text-sm text-[color:var(--mid-gray)] mb-6">
          You can close this window and return to your enrollment tab.
        </p>
        <button className="btn-primary" onClick={() => window.close()}>Close window</button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-5 animate-fade-up">
      <div className="card-static">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
          Parent / Guardian Waiver · {levelLabel(levelParam)}
        </div>
        <h1 className="text-[24px] leading-tight mb-4">Sapphire Clinics East — Class Program</h1>

        <WaiverBody />

        <form className="mt-6 space-y-4" onSubmit={handleSign}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Parent / Guardian full name</span>
              <input required name="parentName" className="input" placeholder="As it should appear on the waiver" />
            </label>
            <label className="block">
              <span className="label">Date</span>
              <input className="input" value={new Date().toLocaleDateString()} readOnly />
            </label>
          </div>

          <div>
            <span className="label">Signature</span>
            <SignaturePad onChange={setSignatureDataUrl} height={180} />
          </div>

          <button type="submit" className="btn-cta w-full mt-2">Sign &amp; generate waiver</button>
          <p className="text-[11px] text-[color:var(--mid-gray)] text-center" style={{ fontFamily: 'var(--font-display)' }}>
            The signed waiver will be attached to your enrollment automatically.
          </p>
        </form>
      </div>
    </div>
  )
}

function WaiverBody() {
  return (
    <div className="prose prose-sm max-w-none text-[14px] leading-relaxed text-[color:var(--ink)] space-y-3">
      <p className="text-[color:var(--mid-gray)] italic">
        Waiver template placeholder — replace this block with the final waiver text once the template is provided. The signature pad and parent/guardian fields below will be merged into the generated PDF.
      </p>
      <p>
        I, the undersigned parent/guardian, give my consent for my child to participate in the Sapphire Clinics East class program. I have read and understood the school&apos;s policies on attendance, health and safety, photography, and emergency procedures.
      </p>
      <p>
        I agree to provide accurate information during enrollment and to notify the school promptly of any changes to my child&apos;s medical condition, contact details, or pickup arrangements.
      </p>
      <p>
        I authorise the school to take reasonable action in the event of a medical emergency, including contacting our designated provider, while making every effort to reach me.
      </p>
    </div>
  )
}
