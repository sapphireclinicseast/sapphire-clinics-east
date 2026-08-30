import { getSessionDoctor } from '@/lib/auth'
import DoctorSettingsForm from './DoctorSettingsForm'

export const dynamic = 'force-dynamic'

export default async function DoctorSettingsPage() {
  const d = await getSessionDoctor()
  if (!d) return null
  return <DoctorSettingsForm init={{
    consultFee: d.consultFee != null ? String(Number(d.consultFee)) : '',
    teleconsultEnabled: d.teleconsultEnabled, inPersonEnabled: d.inPersonEnabled,
    clinicName: d.clinicName ?? '', clinicAddress: d.clinicAddress ?? '', clinicCity: d.clinicCity ?? '',
    postNominals: d.postNominals ?? '', specialization: d.specialization ?? '', prcNumber: d.prcNumber ?? '', ptrNumber: d.ptrNumber ?? '', phone: d.phone ?? '',
    signature: d.signature ?? '',
    bankName: d.bankName ?? '', bankAccountNo: d.bankAccountNo ?? '', bankAccountName: d.bankAccountName ?? '', gcashNumber: d.gcashNumber ?? '',
  }} />
}
