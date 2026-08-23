// Server-side PayMongo Checkout Session creator. Class-portal posts
// here with the chosen plan + student details; we hit PayMongo with the
// secret key (server-only) and return the hosted checkout URL.

import { NextRequest, NextResponse } from 'next/server'

interface CreateCheckoutBody {
  studentId: string
  studentEmail: string
  studentName: string
  plan: 'ANNUAL' | 'BIANNUAL' | 'MONTHLY'
  paymentId: string
  // amounts in PHP centavos (tuitionAmount is already net of any voucher)
  tuitionAmount: number
  miscAmount: number
  period: string
  voucherCode?: string
  discountPercent?: number
  // Student's branch — routes the charge to that branch's PayMongo
  // account (each branch's PayMongo settles into its own BDO bank
  // account, so the branch must own the checkout session). Optional
  // for back-compat; missing/unknown branch falls back to the shared
  // PAYMONGO_SECRET_KEY.
  branch?: 'EAST' | 'GREENHILLS'
}

/** Resolve the PayMongo secret key for a branch. Env var naming keeps
 *  the SBEA/SBGH short codes for backward-compat with the operations
 *  hub — those are data keys, not display labels, and the rebrand
 *  memo explicitly leaves them alone.
 *
 *  Priority:
 *    1. PAYMONGO_SECRET_KEY_SBEA / SBGH (per-branch, LIVE keys)
 *    2. PAYMONGO_SECRET_KEY (single fallback — legacy behaviour)
 */
function secretKeyFor(branch?: 'EAST' | 'GREENHILLS'): string | null {
  const short = branch === 'EAST' ? 'SBEA' : branch === 'GREENHILLS' ? 'SBGH' : null
  const perBranch = short ? process.env[`PAYMONGO_SECRET_KEY_${short}`] : undefined
  return perBranch || process.env.PAYMONGO_SECRET_KEY || null
}

export async function POST(req: NextRequest) {
  let body: CreateCheckoutBody
  try { body = await req.json() as CreateCheckoutBody } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const { studentId, studentEmail, studentName, plan, paymentId, tuitionAmount, miscAmount, period, voucherCode, discountPercent, branch } = body

  const secret = secretKeyFor(branch)
  if (!secret) {
    return NextResponse.json({
      error: `No PayMongo key configured for branch ${branch ?? '(unknown)'}. Set PAYMONGO_SECRET_KEY_${branch === 'EAST' ? 'SBEA' : branch === 'GREENHILLS' ? 'SBGH' : 'SBEA'} or the fallback PAYMONGO_SECRET_KEY on the server.`,
    }, { status: 500 })
  }

  const hasDiscount = !!voucherCode && Number(discountPercent) > 0
  const tuitionDescription = hasDiscount
    ? `${studentName} · ${period} · ${discountPercent}% voucher (${voucherCode})`
    : `${studentName} · ${period}`

  const lineItems = [
    {
      name: `SCEI × LBCA Tuition — ${planLabel(plan)}`,
      description: tuitionDescription,
      amount: tuitionAmount,
      currency: 'PHP',
      quantity: 1,
    },
    ...(miscAmount > 0 ? [{
      name: 'Miscellaneous fees',
      description: 'Annual miscellaneous',
      amount: miscAmount,
      currency: 'PHP',
      quantity: 1,
    }] : []),
  ]

  const origin = req.nextUrl.origin
  const successUrl = `${origin}/pay/success?session_id={CHECKOUT_SESSION_ID}&payment_id=${encodeURIComponent(paymentId)}`
  const cancelUrl = `${origin}/pay`

  const upstream = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + Buffer.from(secret + ':').toString('base64'),
    },
    body: JSON.stringify({
      data: {
        attributes: {
          send_email_receipt: true,
          show_description: true,
          show_line_items: true,
          line_items: lineItems,
          payment_method_types: ['gcash', 'card', 'paymaya', 'grab_pay'],
          success_url: successUrl,
          cancel_url: cancelUrl,
          billing: {
            email: studentEmail,
            name: studentName || studentEmail,
          },
          description: `Class-portal tuition payment · ${studentName} · ${period}`,
          reference_number: paymentId,
          metadata: {
            student_id: studentId,
            plan,
            period,
            payment_id: paymentId,
            ...(branch ? { branch } : {}),
            ...(hasDiscount ? { voucher_code: voucherCode!, discount_percent: String(discountPercent) } : {}),
          },
        },
      },
    }),
  })

  const text = await upstream.text()
  if (!upstream.ok) {
    return NextResponse.json({ error: 'PayMongo error: ' + text.slice(0, 400) }, { status: upstream.status })
  }
  const json = JSON.parse(text) as { data: { id: string; attributes: { checkout_url: string } } }
  return NextResponse.json({
    checkoutId: json.data.id,
    checkoutUrl: json.data.attributes.checkout_url,
  })
}

function planLabel(p: CreateCheckoutBody['plan']): string {
  switch (p) {
    case 'ANNUAL': return 'Annual'
    case 'BIANNUAL': return 'Bi-annual'
    case 'MONTHLY': return 'Monthly'
  }
}
