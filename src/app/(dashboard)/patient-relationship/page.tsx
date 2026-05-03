import { auth } from '@/lib/auth'
import PatientRelationshipClient from './PatientRelationshipClient'

export default async function PatientRelationshipPage() {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role ?? ''
  return <PatientRelationshipClient role={role} />
}
