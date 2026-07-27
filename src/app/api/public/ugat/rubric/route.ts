// GET   → the grading rubric (any admin / assessor).
// PATCH → replace the rubric config (MAIN_ADMIN only).

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tokenFromRequest, canViewAdmin } from '@/lib/ugat-auth'
import { DEFAULT_RUBRIC, normalizeRubric } from '@/lib/ugat-rubric'

export const dynamic = 'force-dynamic'

async function currentRubric() {
  const row = await prisma.ugatRubric.findUnique({ where: { key: 'default' } })
  return row ? normalizeRubric(row.config) : DEFAULT_RUBRIC
}

export async function GET(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || !canViewAdmin(tok.role)) return NextResponse.json({ error: 'Admin authorization required.' }, { status: 401 })
  return NextResponse.json({ rubric: await currentRubric() })
}

export async function PATCH(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || tok.role !== 'MAIN_ADMIN') return NextResponse.json({ error: 'Only the main administrator can edit the rubric.' }, { status: 403 })
  let body: { config?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const config = normalizeRubric(body.config)
  await prisma.ugatRubric.upsert({
    where: { key: 'default' },
    create: { key: 'default', config: config as object },
    update: { config: config as object },
  })
  return NextResponse.json({ ok: true, rubric: config })
}
