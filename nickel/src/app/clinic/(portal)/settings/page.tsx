import { getSessionClinic } from '@/lib/auth'
import ClinicSettingsForm from './ClinicSettingsForm'

export const dynamic = 'force-dynamic'

export default async function ClinicSettingsPage() {
  const c = await getSessionClinic()
  if (!c) return null
  return <ClinicSettingsForm init={{
    name: c.name, contactPerson: c.contactPerson ?? '', phone: c.phone ?? '',
    businessType: c.businessType, tin: c.tin ?? '', address: c.address ?? '', city: c.city ?? '',
  }} />
}
