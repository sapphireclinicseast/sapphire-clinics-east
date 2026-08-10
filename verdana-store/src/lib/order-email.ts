// Sends a warm order-confirmation / thank-you email to the customer after a
// successful PayMongo payment. Best-effort: never throws to the webhook caller.

interface OrderLike {
  id: string
  amount: number
  currency: string
  customerName: string
  customerEmail: string
  customerAddress: string
  customerCity: string
  customerZip: string
  shippingFee: number
  discountAmount?: number
  voucherCode?: string
  items: Array<{
    title: string
    variantLabel?: string
    quantity: number
    price: number
  }>
}

const DEFAULT_FROM = 'Verdana Rehab Solutions <noreply@do-not-reply.sapphireclinicseast.org>'
// Team gets a blind copy so every paid order lands in an inbox too.
const DEFAULT_NOTIFY = 'verdanatrading@gmail.com'

const peso = (n: number) =>
  '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

function buildHtml(order: OrderLike): string {
  const first = (order.customerName || '').trim().split(/\s+/)[0] || 'there'
  const rows = order.items
    .map((it) => {
      const label = it.variantLabel ? `${esc(it.title)} <span style="color:#8a8578">(${esc(it.variantLabel)})</span>` : esc(it.title)
      return `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #efe9df;color:#3d3a34;">${label}<br><span style="color:#8a8578;font-size:13px;">Qty ${esc(it.quantity)}</span></td>
        <td style="padding:10px 0;border-bottom:1px solid #efe9df;text-align:right;color:#3d3a34;white-space:nowrap;">${peso(it.price * it.quantity)}</td>
      </tr>`
    })
    .join('')

  const itemsSubtotal = order.items.reduce((s, i) => s + i.price * i.quantity, 0)
  const discount = order.discountAmount || 0

  const addr = [order.customerAddress, order.customerCity, order.customerZip]
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .join(', ')

  return `<!doctype html>
<html><body style="margin:0;background:#f7f3ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="font-size:22px;font-weight:700;color:#2f7d73;letter-spacing:.5px;">Verdana Rehab Solutions</div>
    </div>
    <div style="background:#ffffff;border-radius:16px;padding:32px;border:1px solid #efe9df;">
      <h1 style="margin:0 0 8px;font-size:22px;color:#3d3a34;">Thank you, ${esc(first)}! 🌱</h1>
      <p style="margin:0 0 20px;color:#6b675e;line-height:1.6;font-size:15px;">
        We're so grateful you chose Verdana. Your order is confirmed and our team is already
        getting it ready with care. Here's a summary of what you ordered:
      </p>

      <table style="width:100%;border-collapse:collapse;font-size:15px;margin-bottom:8px;">
        ${rows}
      </table>

      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#6b675e;margin-top:8px;">
        <tr><td style="padding:4px 0;">Subtotal</td><td style="padding:4px 0;text-align:right;">${peso(itemsSubtotal)}</td></tr>
        ${discount > 0 ? `<tr><td style="padding:4px 0;">Discount${order.voucherCode ? ' (' + esc(order.voucherCode) + ')' : ''}</td><td style="padding:4px 0;text-align:right;">-${peso(discount)}</td></tr>` : ''}
        <tr><td style="padding:4px 0;">Shipping</td><td style="padding:4px 0;text-align:right;">${order.shippingFee ? peso(order.shippingFee) : 'Free'}</td></tr>
        <tr><td style="padding:10px 0 0;font-weight:700;color:#3d3a34;font-size:16px;border-top:1px solid #efe9df;">Total paid</td><td style="padding:10px 0 0;text-align:right;font-weight:700;color:#2f7d73;font-size:16px;border-top:1px solid #efe9df;">${peso(order.amount)}</td></tr>
      </table>

      ${addr ? `<div style="margin-top:24px;padding-top:20px;border-top:1px solid #efe9df;">
        <div style="font-size:13px;text-transform:uppercase;letter-spacing:.5px;color:#a8a296;margin-bottom:6px;">Shipping to</div>
        <div style="color:#3d3a34;font-size:15px;line-height:1.5;">${esc(order.customerName)}<br>${esc(addr)}</div>
      </div>` : ''}

      <p style="margin:24px 0 0;color:#6b675e;line-height:1.6;font-size:14px;">
        We'll send another note the moment your order ships. Some of our made-to-order and
        pre-order pieces take a little longer (45–60 days) — every one is worth the wait. 💛
      </p>
      <p style="margin:16px 0 0;color:#6b675e;line-height:1.6;font-size:14px;">
        Questions? Just reply to this email and a real person on our team will help.
      </p>
    </div>
    <p style="text-align:center;color:#a8a296;font-size:12px;margin-top:20px;">
      Order ${esc(order.id)} · Verdana Rehab Solutions · verdanarehab.com
    </p>
  </div>
</body></html>`
}

export async function sendOrderConfirmation(order: OrderLike): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const to = (order.customerEmail || '').trim()
  if (!apiKey) {
    console.error('Order email: RESEND_API_KEY not set')
    return
  }
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    console.log('Order email: skipped (no valid customer email)')
    return
  }

  const from = process.env.RESEND_FROM || DEFAULT_FROM
  const bcc = (process.env.ORDER_NOTIFY || DEFAULT_NOTIFY)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  // The from-address is a no-reply sender, but the email invites a reply — so route
  // replies to a monitored inbox where a real person can answer.
  const replyTo = process.env.ORDER_REPLY_TO || 'verdanatrading@gmail.com'

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        ...(bcc.length ? { bcc } : {}),
        reply_to: replyTo,
        subject: `Thank you for your order! 🌱 (${order.id})`,
        html: buildHtml(order),
      }),
    })
    if (!res.ok) {
      console.error('Order email Resend error:', res.status, await res.text().catch(() => ''))
    } else {
      console.log('Order confirmation email sent to', to)
    }
  } catch (e) {
    console.error('Order email send failed:', e)
  }
}
