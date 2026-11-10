import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { ACK_WRITE_ROLES } from '@/lib/form-ack'
import { AckForm } from './[branch]/AckForm'

// Med rep signing link: one general link for every branch. The med rep signs
// in with their own hub account and picks East or Greenhills on the form; that
// pick decides whose on-hand the referral pads draw down.
export const metadata: Metadata = { title: 'Acknowledgment Receipt' }

export default async function AcknowledgeGeneralPage() {
  const session = await auth()
  if (!session?.user) redirect(`/login?callbackUrl=${encodeURIComponent('/acknowledge')}`)
  return (
    <AckForm
      initialBranch={null}
      userName={session.user.name || session.user.email || 'Signed-in user'}
      allowed={ACK_WRITE_ROLES.includes((session.user.role as string) || '')}
    />
  )
}
