import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { generateBirthdayCardHTML } from '@/lib/image-gen'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { staffName, caption, photoDataUrl, branch, template } = await req.json()

  const html = generateBirthdayCardHTML({
    staffName,
    photoUrl: photoDataUrl,
    caption,
    branch,
    template,
  })

  return NextResponse.json({ html })
}
