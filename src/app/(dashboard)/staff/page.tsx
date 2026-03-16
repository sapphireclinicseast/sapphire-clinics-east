import { auth } from '@/lib/auth'
import StaffClient from './StaffClient'

export default async function StaffPage() {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role ?? ''
  return <StaffClient role={role} />
}
