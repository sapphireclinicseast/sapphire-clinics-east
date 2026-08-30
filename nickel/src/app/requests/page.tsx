import { getSessionPatient } from '@/lib/auth'
import RequestsClient from './RequestsClient'

export const metadata = { title: 'Request a therapist' }
export const dynamic = 'force-dynamic'

export default async function RequestsPage() {
  // No login wall — patients can start a request while signed out and create an
  // account at the moment they post it (like the booking flow).
  const patient = await getSessionPatient()
  return <RequestsClient loggedIn={!!patient} walletBalance={Number(patient?.walletBalance ?? 0)} defaultCity={patient?.city ?? ''} />
}
