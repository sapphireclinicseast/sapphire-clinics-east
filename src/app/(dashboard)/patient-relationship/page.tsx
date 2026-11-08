import { auth } from '@/lib/auth'
import PatientRelationshipClient from './PatientRelationshipClient'

// ?tab= opens straight on one tab, so the dashboard's waitlist and
// cancellation-fee cards can link to the list they are talking about instead of
// landing on Waitlist and leaving the reader to find it. Read here rather than
// in the client so the first render is already the right tab — picking it after
// mount would flash the Waitlist tab and fire its HR fetch for nothing.
const TABS = ['waitlist', 'followup', 'noshow', 'cancellation'] as const
type Tab = (typeof TABS)[number]

export default async function PatientRelationshipPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>
}) {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role ?? ''
  const { tab } = (await searchParams) ?? {}
  const initialTab = TABS.includes(tab as Tab) ? (tab as Tab) : 'waitlist'
  return <PatientRelationshipClient role={role} initialTab={initialTab} />
}
