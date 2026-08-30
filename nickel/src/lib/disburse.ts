// Rail-agnostic disbursement adapter for Nickel payouts.
//
// Nickel collects via PayMongo (Verdana account). Paying therapists/doctors out
// is a separate outbound transfer. This adapter tries an API disbursement when
// one is configured; otherwise it reports `manual: true` and the payout is added
// to a bulk-upload CSV for the bank/PayMongo portal.
//
// To enable PayMongo Disbursements later: set PAYMONGO_DISBURSE_ENABLED=true and
// PAYMONGO_SECRET_KEY, then fill in the marked fetch() below with PayMongo's
// disbursement endpoint (request the feature from PayMongo to get the contract).

export interface DisburseInput {
  amount: number          // PHP
  method: string          // "bank" | "gcash"
  bankName?: string | null
  account?: string | null // bank account no. or GCash no.
  accountName?: string | null
  reference: string       // our Payout id (idempotency)
  recipientEmail?: string | null
}
export interface DisburseResult { ok: boolean; ref?: string; manual?: boolean; error?: string }

export async function disburse(input: DisburseInput): Promise<DisburseResult> {
  const enabled = process.env.PAYMONGO_DISBURSE_ENABLED === 'true' && !!process.env.PAYMONGO_SECRET_KEY
  if (!enabled) return { manual: true, ok: false }

  try {
    // ── PayMongo Disbursements (enable + fill in when available) ───────────────
    // const auth = 'Basic ' + Buffer.from(`${process.env.PAYMONGO_SECRET_KEY}:`).toString('base64')
    // const res = await fetch('https://api.paymongo.com/v1/disbursements', {
    //   method: 'POST',
    //   headers: { Authorization: auth, 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ data: { attributes: {
    //     amount: Math.round(input.amount * 100),
    //     currency: 'PHP',
    //     destination: { type: input.method === 'gcash' ? 'gcash' : 'bank', account_number: input.account, account_name: input.accountName, bank: input.bankName },
    //     reference_number: input.reference,
    //   } } }),
    // })
    // const d = await res.json()
    // if (!res.ok) return { ok: false, error: d?.errors?.[0]?.detail ?? 'Disbursement failed' }
    // return { ok: true, ref: d?.data?.id }
    return { manual: true, ok: false } // adapter present but not yet wired
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Disbursement error' }
  }
}
