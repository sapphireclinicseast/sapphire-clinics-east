import { auth } from '@/lib/auth'
import RegistrationFormsClient from './RegistrationFormsClient'

export default async function RegistrationFormsPage() {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role ?? ''
  return <RegistrationFormsClient role={role} />
}
