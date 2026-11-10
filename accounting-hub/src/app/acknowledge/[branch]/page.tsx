import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { ACK_WRITE_ROLES, resolveAckBranch } from '@/lib/form-ack'
import { AckForm } from './AckForm'

// Older per-branch form of the med rep link (/acknowledge/east): same form as
// the general /acknowledge, with that branch already picked.
export async function generateMetadata({ params }: { params: Promise<{ branch: string }> }): Promise<Metadata> {
  const b = resolveAckBranch((await params).branch)
  return { title: b ? `Acknowledgment · ${b.shortName}` : 'Acknowledgment' }
}

export default async function AcknowledgePage({ params }: { params: Promise<{ branch: string }> }) {
  const b = resolveAckBranch((await params).branch)
  if (!b) notFound()
  const session = await auth()
  if (!session?.user) redirect(`/login?callbackUrl=${encodeURIComponent(`/acknowledge/${b.slug}`)}`)
  return (
    <AckForm
      initialBranch={b}
      userName={session.user.name || session.user.email || 'Signed-in user'}
      allowed={ACK_WRITE_ROLES.includes((session.user.role as string) || '')}
    />
  )
}
