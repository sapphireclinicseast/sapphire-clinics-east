import { auth } from '@/lib/auth'
import PartnerInstitutionsClient from './PartnerInstitutionsClient'

export default async function PartnerInstitutionsPage() {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role ?? ''
  return <PartnerInstitutionsClient role={role} />
}
