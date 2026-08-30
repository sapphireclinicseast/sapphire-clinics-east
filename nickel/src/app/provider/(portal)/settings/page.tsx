import { getSessionProvider } from '@/lib/auth'
import SettingsForm from './SettingsForm'

export default async function SettingsPage() {
  const p = await getSessionProvider()
  if (!p) return null
  return (
    <SettingsForm
      init={{
        rate: p.rate != null ? String(Number(p.rate)) : '',
        transpoIncluded: p.transpoIncluded,
        dob: p.dob ? p.dob.toISOString().slice(0, 10) : '',
        priceInitialEval: p.priceInitialEval != null ? String(Number(p.priceInitialEval)) : '',
        priceTreatmentSpecialized: p.priceTreatmentSpecialized != null ? String(Number(p.priceTreatmentSpecialized)) : '',
        priceProgressReport: p.priceProgressReport != null ? String(Number(p.priceProgressReport)) : '',
        priceHEP: p.priceHEP != null ? String(Number(p.priceHEP)) : '',
        specialization: p.specialization ?? '',
        specializedRate: p.specializedRate != null ? String(Number(p.specializedRate)) : '',
        specializedRateApproved: p.specializedRateApproved,
        prcNumber: p.prcNumber ?? '',
        ptrNumber: p.ptrNumber ?? '',
        signature: p.signature ?? '',
        bankName: p.bankName ?? '',
        bankAccountNo: p.bankAccountNo ?? '',
        bankAccountName: p.bankAccountName ?? '',
        gcashNumber: p.gcashNumber ?? '',
        gcashName: p.gcashName ?? '',
      }}
    />
  )
}
