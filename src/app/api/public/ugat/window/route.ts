// GET /api/public/ugat/window   (public)
// Whether the application form is currently open, for which academic year,
// and when it closes — or when the next cycle opens if closed.

import { NextResponse } from 'next/server'
import { getWindow } from '@/lib/ugat-cycle'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json(await getWindow())
  } catch {
    return NextResponse.json({ open: false })
  }
}
