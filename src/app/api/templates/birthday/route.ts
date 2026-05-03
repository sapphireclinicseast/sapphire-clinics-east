import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { generateBirthdayCaption } from '@/lib/openai'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { staffName } = await req.json()
  if (!staffName) return NextResponse.json({ error: 'staffName required' }, { status: 400 })

  const caption = await generateBirthdayCaption(staffName)
  return NextResponse.json({ caption })
}
