import { auth } from '@/lib/auth'
import PatientsPage from './PatientsClient'

export default async function PatientsRoute() {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role ?? ''
  const userEmail = (session?.user as { email?: string | null })?.email ?? ''
  return <PatientsPage role={role} userEmail={userEmail} />
}
