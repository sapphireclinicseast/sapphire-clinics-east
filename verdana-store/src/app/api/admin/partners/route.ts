import { NextResponse } from 'next/server'
import { readPartners, publicPartner } from '@/lib/partners'

// Admin-only (guarded by middleware matcher /api/admin/*). Lists institutional
// partners with their subscription status, tier, codes, rep contact and counts.
export async function GET() {
  const partners = await readPartners()
  return NextResponse.json({ partners: partners.map(publicPartner) })
}
