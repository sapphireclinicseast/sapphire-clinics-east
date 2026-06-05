// Admin update for Sappy's editable copy settings (intro greeting, system
// prompt, fallback message). Token-protected.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkAdminToken } from '@/lib/sappy-admin'
import { invalidateChatTemplatesCache } from '@/lib/chat-templates'

const ALLOWED_KEYS = ['intro_message', 'system_prompt', 'fallback_message'] as const

export async function PUT(req: NextRequest) {
  if (!checkAdminToken(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const updates: { key: string; value: string }[] = []
  for (const key of ALLOWED_KEYS) {
    const v = body[key]
    if (typeof v === 'string') {
      if (!v.trim()) {
        return NextResponse.json({ error: `${key} cannot be empty` }, { status: 400 })
      }
      updates.push({ key, value: v })
    }
  }

  if (!updates.length) {
    return NextResponse.json({ error: 'No valid settings provided' }, { status: 400 })
  }

  await prisma.$transaction(
    updates.map((u) =>
      prisma.chatSetting.upsert({
        where: { key: u.key },
        update: { value: u.value },
        create: { key: u.key, value: u.value },
      }),
    ),
  )

  invalidateChatTemplatesCache()
  return NextResponse.json({ ok: true })
}
