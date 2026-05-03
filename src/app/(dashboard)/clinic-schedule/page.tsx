import { auth } from '@/lib/auth'
import ClinicScheduleClient from './ClinicScheduleClient'

export default async function ClinicSchedulePage() {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role ?? ''
  return <ClinicScheduleClient role={role} />
}
