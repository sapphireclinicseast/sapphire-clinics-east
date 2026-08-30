import { getSessionClinic } from '@/lib/auth'
import ClinicVerifyForm from './ClinicVerifyForm'

export const dynamic = 'force-dynamic'

export default async function ClinicVerifyPage() {
  const c = await getSessionClinic()
  if (!c) return null
  return <ClinicVerifyForm
    status={c.verificationStatus}
    businessType={c.businessType}
    tin={c.tin ?? ''}
    rejection={c.rejectionReason ?? ''}
    has={{ secDti: !!c.secDtiFile, bir: !!c.bir2303File, aoi: !!c.aoiFile, byLaws: !!c.byLawsFile, permit: !!c.businessPermitFile }}
  />
}
