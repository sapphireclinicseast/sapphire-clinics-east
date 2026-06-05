// Admin CRUD for Aurora FAQ templates. Token-protected (server-to-server from
// the client-portal admin proxy). GET lists FAQs + settings; POST creates an
// FAQ.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkAdminToken } from '@/lib/aurora-admin'
import { invalidateChatTemplatesCache } from '@/lib/chat-templates'

export async function GET(req: NextRequest) {
  if (!checkAdminToken(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [faqs, settingRows] = await Promise.all([
    prisma.chatFaq.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.chatSetting.findMany(),
  ])
  const settings: Record<string, string> = {}
  for (const s of settingRows) settings[s.key] = s.value

  return NextResponse.json({ faqs, settings })
}

export async function POST(req: NextRequest) {
  if (!checkAdminToken(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    label?: string
    keywords?: string
    answer?: string
    enabled?: boolean
    sortOrder?: number
  }

  const keywords = (body.keywords ?? '').trim()
  const answer = (body.answer ?? '').trim()
  if (!keywords || !answer) {
    return NextResponse.json({ error: 'Keywords and answer are required' }, { status: 400 })
  }

  // Default a new entry to the end of the list.
  const last = await prisma.chatFaq.findFirst({ orderBy: { sortOrder: 'desc' } })
  const sortOrder = body.sortOrder ?? (last ? last.sortOrder + 10 : 10)

  const faq = await prisma.chatFaq.create({
    data: {
      label: (body.label ?? '').trim(),
      keywords,
      answer,
      enabled: body.enabled ?? true,
      sortOrder,
    },
  })
  invalidateChatTemplatesCache()
  return NextResponse.json({ faq })
}
