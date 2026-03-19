import { auth } from '@/lib/auth'
import PeerEvalClient from './PeerEvalClient'

export default async function PeerEvalPage() {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role ?? ''
  return <PeerEvalClient role={role} />
}
