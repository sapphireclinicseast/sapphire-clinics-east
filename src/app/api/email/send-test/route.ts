import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getLegacyRefreshToken, getGmailClient, makeEmailBody } from '@/lib/email'
import { prisma } from '@/lib/prisma'

const TEST_RECIPIENT = 'marketing@sapphireclinicseast.org'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { subject, body, gmailAccountId } = await req.json()

  if (!subject || !body) {
    return NextResponse.json({ error: 'Subject and body are required' }, { status: 400 })
  }

  let refreshToken: string | null = null
  let senderEmail = 'noreply@sapphireclinicseast.org'

  if (gmailAccountId) {
    const gmailAcct = await prisma.gmailAccount.findUnique({ where: { id: gmailAccountId } })
    if (gmailAcct) {
      refreshToken = gmailAcct.refreshToken
      senderEmail = gmailAcct.email
    }
  }
  if (!refreshToken) refreshToken = getLegacyRefreshToken()
  if (!refreshToken) {
    return NextResponse.json({ error: 'No Gmail account connected' }, { status: 400 })
  }

  try {
    const gmail = await getGmailClient(refreshToken)
    const raw = makeEmailBody(TEST_RECIPIENT, subject, body, senderEmail)
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to send test email' },
      { status: 500 }
    )
  }

  return NextResponse.json({ sent: true })
}
