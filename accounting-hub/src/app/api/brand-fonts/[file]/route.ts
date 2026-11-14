// Brand fonts for printed material (gift cards): Intro Pro, Intro Script and
// Poppins, so every computer prints in the brand fonts whether or not they are
// installed (Hannah, 2026-11-14). Served only to signed-in hub users — never a
// public static file — from server-assets/fonts/brand (Latin subsets, woff2).
// Intro is Fontfabric's; the Intro Script file is the "Demo" cut, the same one
// the Verdana store already serves.

import { NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'
import { auth } from '@/lib/auth'

const FILES = new Set([
  'intro-regular.woff2',
  'intro-bold.woff2',
  'intro-script.woff2',
  'poppins-light.woff2',
  'poppins-medium.woff2',
])

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { file } = await params
  if (!FILES.has(file)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    const bytes = await fs.readFile(path.join(process.cwd(), 'server-assets', 'fonts', 'brand', file))
    return new NextResponse(new Uint8Array(bytes), {
      headers: { 'Content-Type': 'font/woff2', 'Cache-Control': 'private, max-age=604800' },
    })
  } catch {
    return NextResponse.json({ error: 'Font not found on server' }, { status: 404 })
  }
}
