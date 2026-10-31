// POST /api/tuition/items/[id]/collect — retired 2026-10-31. Scheduled tuition
// payments are collected at POS → Tuition, and the sale records them in Class
// Hub. This stub stays because the accounting deploy mirror never removes a
// file deleted from git (deploy.yml checks out `origin/main -- accounting-hub/`,
// which only adds and updates), so deleting the route left the old copy on the
// server importing a helper that no longer exists — and the build failed.
import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ error: 'Collect scheduled tuition payments at POS → Tuition.' }, { status: 410 })
}
