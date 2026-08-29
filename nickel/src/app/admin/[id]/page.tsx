import { redirect, notFound } from 'next/navigation'
import { isAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import ReviewActions from './ReviewActions'

export const metadata = { title: 'Review professional' }
export const dynamic = 'force-dynamic'

const PROF: Record<string, string> = { PT: 'Physical Therapist', OT: 'Occupational Therapist', SLP: 'Speech-Language Pathologist', SPED: 'Special Education', PSYCHOLOGY: 'Psychologist', MD: 'Medical Doctor', ORTHOSIS: 'Orthosis / Prosthesis' }

function Doc({ label, src }: { label: string; src: string | null }) {
  const isImg = !!src && src.startsWith('data:image/')
  const isPdf = !!src && src.startsWith('data:application/pdf')
  return (
    <div className="overflow-hidden rounded-xl border border-[color:var(--line)] bg-[color:var(--mist)]">
      <div className="flex h-32 items-center justify-center bg-[color:var(--mist-2)]">
        {isImg
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={src!} alt={label} className="h-full w-full object-cover" />
          : isPdf ? <span className="text-[26px]">📄</span> : <span className="text-[12px] text-[color:var(--muted)]">Not provided</span>}
      </div>
      <div className="flex items-center justify-between px-3 py-2 text-[12px]">
        <span className="font-medium text-[color:var(--ink)]">{label}</span>
        {src
          ? <a href={src} target="_blank" rel="noopener noreferrer" className="font-semibold text-[color:var(--steel)] hover:underline">View</a>
          : <span className="text-[color:var(--muted)]">—</span>}
      </div>
    </div>
  )
}
function KV({ k, v }: { k: string; v: string | null | undefined }) {
  return <div><div className="text-[12px] font-semibold text-[color:var(--slate)]">{k}</div><div className="mt-0.5 rounded-lg border border-[color:var(--line)] bg-[color:var(--mist)] px-3 py-2 text-[14px] text-[color:var(--ink)]">{v || '—'}</div></div>
}

export default async function ReviewProvider({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) redirect('/admin/login')
  const { id } = await params
  const p = await prisma.provider.findUnique({ where: { id } })
  if (!p) notFound()

  const certs = Array.isArray(p.certifications)
    ? (p.certifications as unknown[]).filter((c): c is Record<string, unknown> => !!c && typeof c === 'object').map((c) => ({ name: String(c.name ?? 'Certification'), file: String(c.file ?? '') }))
    : []
  const statusPill = p.verificationStatus === 'VERIFIED' ? ['Verified', 'bg-emerald-50 text-emerald-700']
    : p.verificationStatus === 'REJECTED' ? ['Rejected', 'bg-red-50 text-red-700']
    : p.verificationStatus === 'PENDING' ? ['Pending review', 'bg-amber-100 text-amber-800'] : ['Not submitted', 'bg-slate-100 text-slate-600']

  return (
    <div className="animate-fade-up mx-auto max-w-3xl">
      <a href="/admin" className="mb-3 inline-block text-[13px] text-[color:var(--steel)] hover:underline">← Back to queue</a>
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-semibold text-[color:var(--ink)]">{p.firstName} {p.lastName}{p.postNominals ? `, ${p.postNominals}` : ''}</h1>
            <p className="text-[13px] text-[color:var(--slate)]">{PROF[p.profession] ?? p.profession} · {p.email}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-[12px] font-semibold ${statusPill[1]}`}>{statusPill[0]}</span>
        </div>

        <div className="my-5 h-px bg-[color:var(--line)]" />
        <div className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--sky)]">Identity</div>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Doc label="Face scan" src={p.facePhoto} />
          <Doc label="Holding PRC ID" src={p.prcHoldingPhoto} />
        </div>

        <div className="my-5 h-px bg-[color:var(--line)]" />
        <div className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--sky)]">Credentials</div>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <KV k="PRC licence no." v={p.prcNumber} />
          <KV k="Years of experience" v={p.yearsExperience} />
          <KV k="Year graduated" v={p.yearGraduated} />
          <KV k="School graduated" v={p.school} />
          <KV k="Postgraduate" v={p.postgraduate} />
          <KV k="Post-nominals" v={p.postNominals} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Doc label="Diploma" src={p.diplomaScan} />
          <Doc label="Transcript of Records" src={p.torScan} />
        </div>

        {(p.specialization || certs.length > 0) && (
          <>
            <div className="my-5 h-px bg-[color:var(--line)]" />
            <div className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--sky)]">Specialization request</div>
            {p.specialization && <p className="mt-2 text-[13.5px] text-[color:var(--ink)]">Requested: <b>{p.specialization}</b>{p.specializedRate != null ? ` · specialized rate ₱${Number(p.specializedRate).toLocaleString('en-PH')}` : ''}</p>}
            {certs.length > 0 && <div className="mt-2 grid gap-3 sm:grid-cols-3">{certs.map((c, i) => <Doc key={i} label={c.name} src={c.file || null} />)}</div>}
          </>
        )}

        <div className="my-5 h-px bg-[color:var(--line)]" />
        <div className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--sky)]">Payout</div>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <KV k="Bank / e-wallet" v={p.bankName} />
          <KV k="Account no." v={p.bankAccountNo} />
          <KV k="Account name" v={p.bankAccountName} />
        </div>

        <div className="my-5 h-px bg-[color:var(--line)]" />
        <ReviewActions
          providerId={p.id}
          status={p.verificationStatus}
          hasSpecialization={!!p.specialization}
          specializedApproved={p.specializedRateApproved}
        />
      </div>
    </div>
  )
}
