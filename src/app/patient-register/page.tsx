import PatientRegisterClient from './PatientRegisterClient'

export const metadata = {
  title: 'Patient Registration — SAPPHIRE Clinics',
  description: 'Register as a new patient at SAPPHIRE Clinics.',
}

export default function PatientRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>
}) {
  return <PatientRegisterClientWrapper searchParamsPromise={searchParams} />
}

async function PatientRegisterClientWrapper({ searchParamsPromise }: { searchParamsPromise: Promise<{ branch?: string }> }) {
  const sp = await searchParamsPromise
  return <PatientRegisterClient defaultBranch={sp.branch ?? ''} />
}
