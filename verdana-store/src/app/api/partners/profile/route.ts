import { NextResponse } from 'next/server'
import { readPartners, writePartners, partnerIdFromRequest, publicPartner } from '@/lib/partners'

// Partner-authed: update the sales-invoice / billing details they add after signup.
export async function POST(req: Request) {
  try {
    const id = partnerIdFromRequest(req)
    if (!id) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 })

    const b = await req.json()
    const clean = (v: unknown) => String(v ?? '').trim()

    const partners = await readPartners()
    const idx = partners.findIndex((p) => p.id === id)
    if (idx === -1) return NextResponse.json({ error: 'Account not found.' }, { status: 401 })

    partners[idx] = {
      ...partners[idx],
      officialBusinessName: clean(b.officialBusinessName) || undefined,
      tin: clean(b.tin) || undefined,
      businessAddress: clean(b.businessAddress) || undefined,
    }
    await writePartners(partners)
    return NextResponse.json({ ok: true, partner: publicPartner(partners[idx]) })
  } catch (e) {
    console.error('Partner profile update error:', e)
    return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 })
  }
}
