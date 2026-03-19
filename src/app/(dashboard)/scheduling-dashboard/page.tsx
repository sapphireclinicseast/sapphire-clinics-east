import { auth } from '@/lib/auth'
import SchedulingDashboardClient from './SchedulingDashboardClient'

export default async function SchedulingDashboardPage() {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role ?? ''
  return <SchedulingDashboardClient role={role} />
}
