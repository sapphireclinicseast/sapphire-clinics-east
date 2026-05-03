import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { generateHolidayCaption } from '@/lib/openai'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { holiday, date } = await req.json()
  if (!holiday || !date) return NextResponse.json({ error: 'holiday and date required' }, { status: 400 })

  const captions = await generateHolidayCaption(holiday, date)
  return NextResponse.json({ captions })
}
