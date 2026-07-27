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

// Friendly URL aliases → internal branch enum values
const BRANCH_ALIAS_MAP: Record<string, string> = {
  'east':        'SANDBOX_EAST',
  'greenhills':  'SANDBOX_GREENHILLS',
  'verdana':     'VERDANA_STORE',
}

async function PatientRegisterClientWrapper({ searchParamsPromise }: { searchParamsPromise: Promise<{ branch?: string }> }) {
  const sp = await searchParamsPromise
  const raw = sp.branch ?? ''
  // Resolve alias (case-insensitive) or use raw value as-is (for backward compat with direct enum values)
  const resolved = BRANCH_ALIAS_MAP[raw.toLowerCase()] ?? raw
  return <PatientRegisterClient defaultBranch={resolved} />
}
