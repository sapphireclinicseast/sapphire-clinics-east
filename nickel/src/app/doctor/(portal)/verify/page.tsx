import { getSessionDoctor } from '@/lib/auth'
import DoctorVerifyForm from './DoctorVerifyForm'

export const dynamic = 'force-dynamic'

export default async function DoctorVerifyPage() {
  const d = await getSessionDoctor()
  if (!d) return null
  return <DoctorVerifyForm status={d.verificationStatus} prcNumber={d.prcNumber ?? ''} hasPrc={!!d.prcLicenseFile} hasId={!!d.governmentIdFile} rejection={d.rejectionReason ?? ''} />
}
