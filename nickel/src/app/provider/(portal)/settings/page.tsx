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
