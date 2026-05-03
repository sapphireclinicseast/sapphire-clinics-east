import { auth } from '@/lib/auth'
import DeckingClient from './DeckingClient'

export default async function DeckingPage() {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role ?? ''
  return <DeckingClient role={role} />
}
