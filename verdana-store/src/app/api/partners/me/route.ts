import { NextResponse } from 'next/server'
import { readPartners, partnerIdFromRequest, publicPartner } from '@/lib/partners'

export async function GET(req: Request) {
  const id = partnerIdFromRequest(req)
  if (!id) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const p = (await readPartners()).find((x) => x.id === id)
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 401 })
  return NextResponse.json({ partner: publicPartner(p) })
}
