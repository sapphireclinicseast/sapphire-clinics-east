import { NextResponse } from 'next/server'
import { readPartners, partnerIdFromRequest, TIERS } from '@/lib/partners'
import { createCheckoutSession } from '@/lib/paymongo'

export async function POST(req: Request) {
  try {
    const id = partnerIdFromRequest(req)
    if (!id) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 })

    const { tier } = await req.json()
    const t = TIERS[tier as keyof typeof TIERS]
    if (!t) return NextResponse.json({ error: 'Please choose a valid tier.' }, { status: 400 })

    const p = (await readPartners()).find((x) => x.id === id)
    if (!p) return NextResponse.json({ error: 'Account not found.' }, { status: 401 })

    const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://verdanarehab.com'
    const session = await createCheckoutSession({
      lineItems: [{
        amount: Math.round(t.annualFee * 100),
        currency: 'PHP',
        name: `Verdana ${t.name} Partner Subscription (1 year)`,
        quantity: 1,
        description: `Annual partner subscription — ${p.institution}`,
      }],
      description: `Verdana ${t.name} Partner Subscription — ${p.institution}`,
      successUrl: `${baseUrl}/account?subscribed=1`,
      cancelUrl: `${baseUrl}/account`,
      metadata: {
        partner_subscription: 'yes',
        partner_id: p.id,
        tier: t.key,
      },
      billing: {
        name: `${p.repFirstName} ${p.repLastName}`.trim(),
        email: p.email,
        phone: p.mobile,
      },
    })

    return NextResponse.json({ url: session.attributes.checkout_url })
  } catch (e) {
    console.error('Partner subscribe error:', e)
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 })
  }
}
