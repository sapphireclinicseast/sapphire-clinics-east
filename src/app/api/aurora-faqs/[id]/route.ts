// Admin update/delete for a single Aurora FAQ template. Token-protected.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkAdminToken } from '@/lib/aurora-admin'
import { invalidateChatTemplatesCache } from '@/lib/chat-templates'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!checkAdminToken(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

  const body = (await req.json().catch(() => ({}))) as {
    label?: string
    keywords?: string
    answer?: string
    enabled?: boolean
    sortOrder?: number
  }

  const data: Record<string, unknown> = {}
  if (body.label !== undefined) data.label = body.label.trim()
  if (body.keywords !== undefined) {
    if (!body.keywords.trim()) {
      return NextResponse.json({ error: 'Keywords cannot be empty' }, { status: 400 })
    }
    data.keywords = body.keywords.trim()
  }
  if (body.answer !== undefined) {
    if (!body.answer.trim()) {
      return NextResponse.json({ error: 'Answer cannot be empty' }, { status: 400 })
    }
    data.answer = body.answer.trim()
  }
  if (body.enabled !== undefined) data.enabled = body.enabled
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder

  const faq = await prisma.chatFaq.update({ where: { id }, data }).catch(() => null)
  if (!faq) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  invalidateChatTemplatesCache()
  return NextResponse.json({ faq })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!checkAdminToken(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

  await prisma.chatFaq.delete({ where: { id } }).catch(() => null)
  invalidateChatTemplatesCache()
  return NextResponse.json({ ok: true })
}
