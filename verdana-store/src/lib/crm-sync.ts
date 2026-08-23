// Mirrors a paying customer into the Operations hub Patient CRM as a
// "Verdana customer" so they can be included in email campaigns.
//
// Best-effort: never throws to the webhook caller. Stays dormant (no-op) until
// both CRM_SYNC_URL and EXTERNAL_API_KEY are configured, so shipping this ahead
// of the Operations-hub endpoint is safe.

interface OrderLike {
  customerName: string
  customerEmail: string
  customerPhone: string
  customerAddress: string
  customerCity: string
  customerZip: string
}

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = (full || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: 'Verdana', lastName: 'Customer' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] }
}

export async function syncCustomerToCRM(order: OrderLike): Promise<void> {
  const url = process.env.CRM_SYNC_URL
  const key = process.env.EXTERNAL_API_KEY
  const email = (order.customerEmail || '').trim()

  if (!url || !key) return // dormant until configured
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.log('CRM sync: skipped (no valid customer email)')
    return
  }

  const { firstName, lastName } = splitName(order.customerName)
  const address = [order.customerAddress, order.customerCity, order.customerZip]
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .join(', ')

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'upsertVerdanaCustomer',
        firstName,
        lastName,
        email,
        phone: order.customerPhone || '',
        address,
        city: (order.customerCity || '').trim(),
      }),
    })
    if (!res.ok) {
      console.error('CRM sync error:', res.status, await res.text().catch(() => ''))
    } else {
      console.log('CRM sync: customer mirrored to Operations hub')
    }
  } catch (e) {
    console.error('CRM sync failed:', e)
  }
}
