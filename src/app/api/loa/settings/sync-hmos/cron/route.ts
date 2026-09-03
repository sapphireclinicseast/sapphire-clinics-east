// POST /api/loa/settings/sync-hmos/cron
//
// Scheduled pull of the HMO digital wallets from the Accounting Hub into the
// LOA form's provider list. Runs the same code as the admin "Sync now" button.
//
// This exists for the same reason the branches cron does: a list that only
// updates when somebody remembers to click a button is not a mirror. An HMO
// added in Point of Sale would otherwise be missing from the patient-facing
// form until someone noticed — and the patient's only symptom would be that
// their provider is not in the dropdown.
//
// Idempotent, and safe to run often: it adds, restores and retires by name,
// and refuses to act at all on an empty or failed response.
//
// Auth: `x-cron-secret: $CRON_SECRET`, same as the other crons here.

import { NextResponse } from 'next/server'
import { syncHmoProvidersFromAccounting } from '@/lib/sync-hmo-providers'

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET not configured on server.' }, { status: 503 })
  }
  if ((req.headers.get('x-cron-secret') ?? '') !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await syncHmoProvidersFromAccounting()
  if (!result.ok) {
    console.error('[loa-hmo-sync-cron]', result.error)
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 })
  }

  console.log(
    `[loa-hmo-sync-cron] ${result.unchanged} unchanged, ` +
    `${result.added.length} added, ${result.restored.length} restored, ${result.retired.length} retired`,
  )
  return NextResponse.json(result)
}

// GET is a health check, mirroring the other crons: it reports whether the
// secret is configured without running anything. The silent 503 from a missing
// CRON_SECRET has bitten this codebase before.
export async function GET() {
  return NextResponse.json({
    cronSecretConfigured: !!process.env.CRON_SECRET,
    accountingKeyConfigured: !!process.env.EXTERNAL_API_KEY,
  })
}
