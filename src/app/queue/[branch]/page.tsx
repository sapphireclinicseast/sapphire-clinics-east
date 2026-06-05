import { notFound } from 'next/navigation'
import QueueDisplay from './QueueDisplay'

const VALID_BRANCHES: Record<string, string> = {
  sbea: 'SBEA',
  sbgh: 'SBGH',
}

export default async function QueuePage({ params }: { params: Promise<{ branch: string }> }) {
  const { branch } = await params
  const branchCode = VALID_BRANCHES[branch.toLowerCase()]
  if (!branchCode) notFound()

  const clinicName = branchCode === 'SBEA'
    ? 'East Branch'
    : 'Greenhills Branch'

  return <QueueDisplay branch={branchCode} clinicName={clinicName} />
}
