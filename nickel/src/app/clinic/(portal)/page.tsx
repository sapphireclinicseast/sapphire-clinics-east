import { getSessionClinic } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`

export default async function ClinicOverview() {
  const clinic = await getSessionClinic()
  if (!clinic) return null
  const [patients, providers] = await Promise.all([
    prisma.patient.count({ where: { clinicId: clinic.id } }),
    prisma.provider.count({ where: { clinicId: clinic.id } }),
  ])

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card"><div className="text-[12px] font-semibold text-[color:var(--muted)]">Clinic wallet</div><div className="mt-1 text-[24px] font-bold text-[color:var(--steel)]">{peso(Number(clinic.walletBalance))}</div><div className="text-[12px] text-[color:var(--slate)]">from clinic-wallet bookings</div></div>
        <div className="card"><div className="text-[12px] font-semibold text-[color:var(--muted)]">Your patients</div><div className="mt-1 text-[24px] font-bold text-[color:var(--ink)]">{patients}</div></div>
        <div className="card"><div className="text-[12px] font-semibold text-[color:var(--muted)]">Your therapists</div><div className="mt-1 text-[24px] font-bold text-[color:var(--ink)]">{providers}</div></div>
      </div>

      {Number(clinic.feesOwed) > 0 && (
        <div className="card"><div className="text-[12px] font-semibold text-[color:var(--muted)]">Platform fees owed to Nickel</div><div className="mt-1 text-[20px] font-bold text-[color:var(--warn,#c9871a)]">{peso(Number(clinic.feesOwed))}</div><div className="text-[12px] text-[color:var(--slate)]">from visits you collected offline (₱20 per visit)</div></div>
      )}

      <div className="card">
        <h2 className="text-[16px] font-semibold text-[color:var(--ink)]">Welcome, {clinic.name}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-[color:var(--slate)]">
          {clinic.verificationStatus === 'VERIFIED'
            ? 'You’re verified. Add your patients and therapists under “Patients & therapists”, then arrange home visits — with payment going straight to the therapist or into your clinic wallet.'
            : 'Once your business documents are approved, you’ll be able to onboard your existing patients and therapists and arrange home visits inside Nickel.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href="/clinic/people" className="btn-primary !px-4 !py-2 !text-[13px]">Patients &amp; therapists</a>
          <a href="/clinic/verify" className="btn-outline !px-4 !py-2 !text-[13px]">Business documents</a>
        </div>
      </div>
    </div>
  )
}
