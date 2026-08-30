import { redirect } from 'next/navigation'
import { getSessionPatient } from '@/lib/auth'
import RequestsClient from './RequestsClient'

export const metadata = { title: 'Request a therapist' }
export const dynamic = 'force-dynamic'

export default async function RequestsPage() {
  const patient = await getSessionPatient()
  if (!patient) redirect('/book')
  return <RequestsClient walletBalance={Number(patient.walletBalance ?? 0)} defaultCity={patient.city ?? ''} />
}
