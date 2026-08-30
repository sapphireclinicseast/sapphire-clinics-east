import { getSessionClinic } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import PeopleManager from './PeopleManager'

export const dynamic = 'force-dynamic'

export default async function ClinicPeoplePage() {
  const clinic = await getSessionClinic()
  if (!clinic) return null
  const [patients, providers] = await Promise.all([
    prisma.patient.findMany({ where: { clinicId: clinic.id }, orderBy: { createdAt: 'desc' }, select: { id: true, firstName: true, lastName: true, email: true, phone: true } }),
    prisma.provider.findMany({ where: { clinicId: clinic.id }, orderBy: { createdAt: 'desc' }, select: { id: true, firstName: true, lastName: true, email: true, profession: true, verificationStatus: true } }),
  ])
  return <PeopleManager
    verified={clinic.verificationStatus === 'VERIFIED'}
    patients={patients}
    providers={providers.map((p) => ({ ...p }))}
  />
}
