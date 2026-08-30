import { redirect } from 'next/navigation'
import { getSessionPatientId, getSessionDoctorId } from '@/lib/auth'
import ConsultRoom from './ConsultRoom'

export const metadata = { title: 'Teleconsult' }
export const dynamic = 'force-dynamic'

export default async function ConsultRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [patientId, doctorId] = await Promise.all([getSessionPatientId(), getSessionDoctorId()])
  if (!patientId && !doctorId) redirect('/book')
  return <ConsultRoom consultId={id} />
}
