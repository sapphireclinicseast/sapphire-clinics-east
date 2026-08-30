import { getSessionProvider } from '@/lib/auth'
import AddSpecialization from './AddSpecialization'

export const metadata = { title: 'Verification' }
export const dynamic = 'force-dynamic'

const STATUS: Record<string, { label: string; cls: string }> = {
  VERIFIED: { label: 'Verified', cls: 'bg-emerald-50 text-emerald-700' },
  PENDING: { label: 'Pending review', cls: 'bg-amber-100 text-amber-800' },
  REJECTED: { label: 'Needs resubmission', cls: 'bg-red-50 text-red-700' },
  UNVERIFIED: { label: 'Not yet submitted', cls: 'bg-slate-100 text-slate-600' },
}

function DocItem({ label, uri }: { label: string; uri: string | null }) {
  if (!uri) return (
    <div className="rounded-xl border border-dashed border-[color:var(--line-2)] p-3 text-center text-[12px] text-[color:var(--muted)]">{label}<div className="mt-1">Not uploaded</div></div>
  )
  const isImg = uri.startsWith('data:image') || (!uri.startsWith('data:') && !uri.endsWith('.pdf'))
  return (
    <div className="rounded-xl border border-[color:var(--line)] p-2">
      <div className="mb-1.5 text-[12px] font-medium text-[color:var(--slate)]">{label}</div>
      {isImg
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={uri} alt={label} className="h-32 w-full rounded-lg object-cover" />
        : <a href={uri} target="_blank" rel="noopener" className="flex h-32 items-center justify-center rounded-lg bg-[color:var(--mist)] text-[13px] font-semibold text-[color:var(--steel)]">Open PDF →</a>}
    </div>
  )
}

export default async function VerificationPage() {
  const p = await getSessionProvider()
  if (!p) return null
  const st = STATUS[p.verificationStatus] ?? STATUS.UNVERIFIED
  const certs = Array.isArray(p.certifications) ? (p.certifications as { name?: string; file?: string }[]) : []

  return (
    <div className="space-y-4">
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[16px] font-semibold">Verification status</h2>
          <span className={`rounded-full px-3 py-1 text-[12.5px] font-semibold ${st.cls}`}>{st.label}</span>
        </div>
        {p.verificationStatus === 'VERIFIED' && <p className="mt-1 text-[12.5px] text-[color:var(--slate)]">Your identity and credentials are verified. You appear to patients and can accept bookings.{p.verifiedAt ? ` Approved ${new Date(p.verifiedAt).toLocaleDateString('en-PH')}.` : ''}</p>}
        {p.verificationStatus === 'PENDING' && <p className="mt-1 text-[12.5px] text-[color:var(--slate)]">SCEI is reviewing your documents — this usually takes 24–48 hours.</p>}
        {p.verificationStatus === 'REJECTED' && <p className="mt-1 text-[12.5px] text-red-700">{p.rejectionReason ? p.rejectionReason + ' ' : ''}Please review and resubmit.</p>}
        {(p.verificationStatus === 'UNVERIFIED' || p.verificationStatus === 'REJECTED') && (
          <a href="/provider/verify" className="btn-primary mt-3 inline-block">{p.verificationStatus === 'REJECTED' ? 'Resubmit documents' : 'Complete verification'} →</a>
        )}
      </section>

      <section className="card">
        <h2 className="mb-3 text-[16px] font-semibold">Your submitted documents</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DocItem label="Face photo" uri={p.facePhoto ?? null} />
          <DocItem label="Holding PRC ID" uri={p.prcHoldingPhoto ?? null} />
          <DocItem label="Diploma" uri={p.diplomaScan ?? null} />
          <DocItem label="Transcript (TOR)" uri={p.torScan ?? null} />
        </div>
        <div className="mt-3 grid gap-2 text-[12.5px] text-[color:var(--slate)] sm:grid-cols-2">
          <div><span className="text-[color:var(--muted)]">PRC No.:</span> {p.prcNumber || '—'}</div>
          <div><span className="text-[color:var(--muted)]">School:</span> {p.school || '—'}{p.yearGraduated ? ` (${p.yearGraduated})` : ''}</div>
        </div>
        {certs.length > 0 && (
          <div className="mt-3">
            <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-[color:var(--muted)]">Certifications</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {certs.map((c, i) => <DocItem key={i} label={c.name || `Certificate ${i + 1}`} uri={c.file ?? null} />)}
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[16px] font-semibold">Specialization</h2>
          {p.specialization
            ? <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${p.specializedRateApproved ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{p.specializedRateApproved ? `Approved · ${p.specialization}` : `Pending · ${p.specialization}`}</span>
            : <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[12px] font-semibold text-slate-600">None yet</span>}
        </div>
        <p className="mb-3 mt-1 text-[12.5px] text-[color:var(--slate)]">Add a specialization and upload its certificate. Once an admin verifies it, you can charge a <b>specialized rate</b> for that service (set it in Settings).</p>
        <AddSpecialization />
      </section>
    </div>
  )
}
