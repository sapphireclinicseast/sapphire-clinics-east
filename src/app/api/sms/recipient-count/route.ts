// POST /api/sms/recipient-count — preview how many patients a given group +
// branch would resolve to, so the New Campaign UI can show "Send to N
// recipients" before the user commits.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { previewRecipientCount } from '@/lib/sms'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const recipientGroup = String(body.recipientGroup ?? '')
  const branch = String(body.branch ?? 'BOTH')

  if (!recipientGroup) return NextResponse.json({ error: 'recipientGroup required' }, { status: 400 })

  try {
    const count = await previewRecipientCount(recipientGroup, branch)
    return NextResponse.json({ count })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
