import { notFound } from 'next/navigation'
import QueueDisplay from './QueueDisplay'

const VALID_BRANCHES: Record<string, string> = {
  // Aura Health Rehab branch slugs (current)
  ahea: 'SBEA',
  ahgh: 'SBGH',
  // Legacy slugs — kept so old QR codes / bookmarks still resolve
  sbea: 'SBEA',
  sbgh: 'SBGH',
}

export default async function QueuePage({ params }: { params: Promise<{ branch: string }> }) {
  const { branch } = await params
  const branchCode = VALID_BRANCHES[branch.toLowerCase()]
  if (!branchCode) notFound()

  const clinicName = branchCode === 'SBEA'
    ? 'Aura Health Rehab - East Branch'
    : 'Aura Health Rehab - Greenhills Branch'

  return <QueueDisplay branch={branchCode} clinicName={clinicName} />
}
