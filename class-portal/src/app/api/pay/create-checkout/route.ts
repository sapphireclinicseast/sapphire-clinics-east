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
  // amounts in PHP centavos
  tuitionAmount: number
  miscAmount: number
  period: string
}

export async function POST(req: NextRequest) {
  const secret = process.env.PAYMONGO_SECRET_KEY
  if (!secret) {
    return NextResponse.json({ error: 'PAYMONGO_SECRET_KEY is not configured on the server.' }, { status: 500 })
  }

  let body: CreateCheckoutBody
  try { body = await req.json() as CreateCheckoutBody } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const { studentId, studentEmail, studentName, plan, paymentId, tuitionAmount, miscAmount, period } = body

  const lineItems = [
    {
      name: `SCEI × LBCA Tuition — ${planLabel(plan)}`,
      description: `${studentName} · ${period}`,
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
