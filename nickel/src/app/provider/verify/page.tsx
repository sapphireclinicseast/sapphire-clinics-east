import { redirect } from 'next/navigation'
import { getSessionProvider } from '@/lib/auth'
import VerifyForm from './VerifyForm'

export const metadata = { title: 'Verify your identity' }

export default async function VerifyPage() {
  const p = await getSessionProvider()
  if (!p) redirect('/provider/login')
  if (p.verificationStatus === 'VERIFIED') redirect('/provider')

  const header = (
    <div className="mb-4 flex items-center justify-between">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--sky)]">Provider verification</div>
        <div className="text-[18px] font-semibold text-[color:var(--ink)]">{p.firstName} {p.lastName}</div>
      </div>
      <form action="/api/provider/logout" method="post">
        <button className="rounded-lg border border-[color:var(--line-2)] px-3 py-1.5 text-[13px] text-[color:var(--slate)] hover:bg-white">Log out</button>
      </form>
    </div>
  )

  if (p.verificationStatus === 'PENDING') {
    return (
      <div className="animate-fade-up mx-auto max-w-xl">
        {header}
        <div className="card text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--mist-2)]">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--steel)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3h10M7 21h10M8 3v3.4a4 4 0 0 0 1.6 3.2L12 12l-2.4 2.4A4 4 0 0 0 8 17.6V21M16 3v3.4a4 4 0 0 1-1.6 3.2L12 12l2.4 2.4a4 4 0 0 1 1.6 3.2V21"/></svg>
          </div>
          <h1 className="text-[20px] font-semibold">Your account is under review</h1>
          <p className="mx-auto mt-2 max-w-md text-[13.5px] text-[color:var(--slate)]">
            Thanks{p.firstName ? `, ${p.firstName.charAt(0) + p.firstName.slice(1).toLowerCase()}` : ''}. We&apos;ve received your documents. SCEI verifies each therapist&apos;s identity and credentials — this usually takes <strong>24–48 hours</strong>. We&apos;ll email you once your account is approved, and then you can set your schedule and start accepting home visits.
          </p>
          <p className="mt-4 text-[12px] text-[color:var(--muted)]">Submitted {p.verificationSubmittedAt ? new Date(p.verificationSubmittedAt).toLocaleString('en-PH') : 'just now'}.</p>
        </div>
      </div>
    )
  }

  // UNVERIFIED or REJECTED → show the form.
  return (
    <div className="animate-fade-up mx-auto max-w-xl">
      {header}
      <VerifyForm
        rejected={p.verificationStatus === 'REJECTED'}
        rejectionReason={p.rejectionReason ?? ''}
        init={{ prcNumber: p.prcNumber ?? '', bankName: p.bankName ?? '', bankAccountNo: p.bankAccountNo ?? '', bankAccountName: p.bankAccountName ?? '' }}
      />
    </div>
  )
}
