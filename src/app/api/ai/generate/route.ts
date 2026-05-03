import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { generatePostCaption } from '@/lib/openai'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { prompt } = await req.json()
  if (!prompt) return NextResponse.json({ error: 'Prompt required' }, { status: 400 })

  try {
    const caption = await generatePostCaption(prompt)
    return NextResponse.json({ caption })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI generation failed'
    const isCredits = msg.includes('credit balance') || msg.includes('insufficient')
    return NextResponse.json(
      { error: isCredits ? 'Claude AI credits needed. Go to console.anthropic.com/settings/billing to add credits.' : msg },
      { status: 500 }
    )
  }
}
