import { auth } from '@/lib/auth'
import QueueingClient from './QueueingClient'

export default async function QueueingPage() {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role ?? ''
  return <QueueingClient role={role} />
}
