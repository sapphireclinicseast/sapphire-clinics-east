import { auth } from '@/lib/auth'
import PatientsPage from './PatientsClient'

export default async function PatientsRoute() {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role ?? ''
  return <PatientsPage role={role} />
}
