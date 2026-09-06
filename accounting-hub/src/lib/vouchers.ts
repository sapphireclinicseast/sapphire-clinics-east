import type { PrismaClient, Prisma } from '@prisma/client'
import { verifyPwdEligibility } from './pwd-verify'

type Tx = PrismaClient | Prisma.TransactionClient

export interface VoucherCheck {
  ok: boolean
  reason?: string
  voucher?: { id: string; name: string; code: string; discountType: string; discountValue: number; accountId: string | null }
  discount?: number      // PHP discount for the given amount
  netAmount?: number     // amount − discount (never below 0)
  /** PWD/Senior voucher only: the CRM patient whose registered ID granted it (audit trail). */
  pwdPatientId?: string
  pwdPatientName?: string
}

/** Round to centavos. */
const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Validate a voucher code for a branch/account + amount, honouring effectivity and the
 * usage cap. `customerEmail` is required to enforce ONCE_PER_CUSTOMER.
 *
 * Returns the computed discount so callers charge a consistent amount. Discount is capped
 * at the gross amount so a fixed voucher larger than the price can never make it negative.
 */
const DEPT_LABEL: Record<string, string> = {
  PT: 'PT', MD: 'MD', OT: 'OT', SLP: 'SLP', SPED: 'SPED',
  PSYCHOLOGY: 'Psychology', ORTHOSIS_PROSTHESIS: 'Orthosis & Prosthesis',
}

export async function checkVoucher(
  tx: Tx,
  opts: {
    code: string; account: string; amountPhp: number; customerEmail?: string | null
    /**
     * The item's service department, for a department-scoped voucher. Pass the
     * service's department for services and null for products (a scoped voucher
     * covers services only). Omit (undefined) when there is no item context —
     * a scoped voucher is then refused rather than silently applied to anything.
     */
    department?: string | null
    // Identify the payer for a PWD/Senior-gated voucher (matched against Patient CRM).
    customerFirstName?: string | null; customerLastName?: string | null; customerPhone?: string | null
    /**
     * True when validating while CREATING a payment link. The payer types their email on
     * PayMongo's hosted page, so it isn't known yet — ONCE_PER_CUSTOMER therefore can't be
     * checked here and is verified when the payment lands instead.
     */
    atCreation?: boolean
  },
): Promise<VoucherCheck> {
  const code = (opts.code || '').trim().toUpperCase()
  if (!code) return { ok: false, reason: 'No voucher code given' }

  const v = await tx.voucher.findUnique({ where: { code } })
  if (!v) return { ok: false, reason: 'Voucher code not found' }
  if (!v.isActive) return { ok: false, reason: 'This voucher is no longer active' }

  // Branch scope — empty list means all branches.
  if (v.branches.length > 0 && !v.branches.includes(opts.account)) {
    return { ok: false, reason: 'This voucher is not valid for this branch' }
  }

  // Department scope — empty list means everything. When set, only services
  // under a ticked department qualify: products (department null) and services
  // in other departments are refused. A service whose department is ALL counts
  // as every department. No item context (undefined) is refused too, so a
  // scoped voucher never applies through a path that can't tell what's bought.
  if (v.departments.length > 0) {
    const dept = (opts.department || '').toUpperCase()
    if (dept !== 'ALL' && !v.departments.includes(dept)) {
      const list = v.departments.map(d => DEPT_LABEL[d] || d).join(', ')
      return { ok: false, reason: `This voucher only applies to ${list} services` }
    }
  }

  // Effectivity — lifetime vouchers skip the window entirely. Compare on date only so a
  // voucher is usable for the whole of its end date.
  if (!v.isLifetime) {
    const today = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }))
    if (v.startDate) {
      const start = new Date(v.startDate.toISOString().slice(0, 10))
      if (today < start) return { ok: false, reason: `This voucher starts on ${start.toISOString().slice(0, 10)}` }
    }
    if (v.endDate) {
      const end = new Date(v.endDate.toISOString().slice(0, 10))
      if (today > end) return { ok: false, reason: `This voucher expired on ${end.toISOString().slice(0, 10)}` }
    }
  }

  // Usage cap.
  if (v.usageLimitType === 'MAX_USES') {
    const used = await tx.voucherRedemption.count({ where: { voucherId: v.id } })
    if (v.maxUses != null && used >= v.maxUses) {
      return { ok: false, reason: `This voucher has reached its limit of ${v.maxUses} use(s)` }
    }
  } else if (v.usageLimitType === 'ONCE_PER_CUSTOMER') {
    const email = (opts.customerEmail || '').trim().toLowerCase()
    if (!email) {
      // At link creation the payer is unknown — allow it and re-check once they pay.
      if (!opts.atCreation) return { ok: false, reason: 'An email address is required to use this voucher' }
    } else {
      const already = await tx.voucherRedemption.count({ where: { voucherId: v.id, customerEmail: email } })
      if (already > 0) return { ok: false, reason: 'This voucher has already been used with that email address' }
    }
  }

  // PWD / Senior discount — only for a payer whose Patient CRM record carries BOTH an ID
  // number and an uploaded ID photo. Skipped at link creation, where the payer is unknown;
  // the check then runs for real when they pay.
  let pwd: { patientId?: string; patientName?: string } = {}
  if (v.requiresPwdId && !opts.atCreation) {
    const elig = await verifyPwdEligibility({
      firstName: opts.customerFirstName, lastName: opts.customerLastName,
      email: opts.customerEmail, phone: opts.customerPhone,
    })
    if (!elig.verified) {
      return { ok: false, reason: elig.reason || 'This voucher needs a registered PWD/Senior ID.' }
    }
    pwd = { patientId: elig.patientId, patientName: elig.patientName }
  }

  const gross = Number(opts.amountPhp) || 0
  const value = Number(v.discountValue) || 0
  const raw = v.discountType === 'FIXED' ? value : gross * (value / 100)
  const discount = r2(Math.min(Math.max(raw, 0), gross))   // never negative, never over the price

  return {
    ok: true,
    voucher: { id: v.id, name: v.name, code: v.code, discountType: v.discountType, discountValue: value, accountId: v.accountId },
    discount,
    netAmount: r2(gross - discount),
    pwdPatientId: pwd.patientId,
    pwdPatientName: pwd.patientName,
  }
}

/** Record a redemption once a discounted checkout is actually created/paid. */
export async function recordRedemption(
  tx: Tx,
  opts: { voucherId: string; checkoutId?: string | null; customerEmail?: string | null; account?: string | null; discountAmount: number },
) {
  return tx.voucherRedemption.create({
    data: {
      voucherId: opts.voucherId,
      checkoutId: opts.checkoutId || null,
      customerEmail: (opts.customerEmail || '').trim().toLowerCase() || null,
      account: opts.account || null,
      discountAmount: opts.discountAmount,
    },
  })
}
