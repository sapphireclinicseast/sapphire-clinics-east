import { NextResponse } from 'next/server'
import { BUILD_VERSION } from '@/lib/version'

export const dynamic = 'force-dynamic'

// The client compares this to its baked-in BUILD_VERSION; a mismatch means the
// page is an old build and it reloads itself.
export async function GET() {
  return NextResponse.json({ version: BUILD_VERSION }, { headers: { 'Cache-Control': 'no-store' } })
}
