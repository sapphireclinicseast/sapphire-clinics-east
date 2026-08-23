// Activates (or renews) a partner subscription once PayMongo confirms payment:
// generates/refreshes the two discount codes (patient + clinic/consultant), sets a
// one-year expiry, and flips the partner to active. Called from the PayMongo webhook.
// SERVER-ONLY.

import { readPartners, writePartners, TIERS, type Tier } from './partners'
import { readVouchers, writeVouchers, codeExists, normalizeCode, type Voucher } from './vouchers'
import { randomBytes } from 'crypto'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no ambiguous 0/O/1/I

function randCode(prefix: string): string {
  const b = randomBytes(6)
  let s = ''
  for (let i = 0; i < 6; i++) s += ALPHABET[b[i] % ALPHABET.length]
  return `${prefix}-${s}`
}

async function uniqueCode(prefix: string): Promise<string> {
  for (let i = 0; i < 25; i++) {
    const c = randCode(prefix)
    if (!(await codeExists(c))) return c
  }
  return randCode(`${prefix}X`)
}

export async function activatePartnerSubscription(
  partnerId: string,
  tierKey: Tier['key'],
  checkoutId: string,
): Promise<boolean> {
  const partners = await readPartners()
  const idx = partners.findIndex((p) => p.id === partnerId)
  if (idx === -1) {
    console.error('Partner subscription: partner not found', partnerId)
    return false
  }
  const p = partners[idx]

  // Idempotency: the SAME PayMongo checkout won't be processed twice (dup webhooks).
  if (checkoutId && (p.processedCheckouts || []).includes(checkoutId)) {
    console.log('Partner subscription: checkout already processed, skipping', checkoutId)
    return false
  }

  const tier = TIERS[tierKey]
  if (!tier) {
    console.error('Partner subscription: unknown tier', tierKey)
    return false
  }

  const now = new Date()
  const exp = new Date(now)
  exp.setFullYear(exp.getFullYear() + 1)
  const expStr = exp.toISOString().slice(0, 10) // yyyy-mm-dd → codes auto-expire in 1 year

  // Reuse existing codes on renewal so partners keep the same codes year to year;
  // generate fresh ones only on first subscription.
  const patientCode = p.patientCode || (await uniqueCode('VERD-PAT'))
  const clinicCode = p.consultantCode || (await uniqueCode('VERD-CLI'))

  const vouchers = await readVouchers()
  const upsert = (code: string, scope: 'patient' | 'clinic', rates: { toys: number; bulky: number }, headline: number) => {
    const v: Voucher = {
      code, discountType: 'percent', discountValue: headline, freeShipping: false,
      active: true, expiresAt: expStr, scope, partnerId, categoryRates: rates,
      description: `${tier.name} ${scope === 'patient' ? 'patient' : 'clinic/consultant'} discount — ${p.institution}`,
    }
    const i = vouchers.findIndex((x) => normalizeCode(x.code) === normalizeCode(code))
    if (i >= 0) vouchers[i] = { ...vouchers[i], ...v }
    else vouchers.push(v)
  }
  upsert(patientCode, 'patient', { toys: tier.patientToys, bulky: 0 }, tier.patientToys)
  upsert(clinicCode, 'clinic', { toys: tier.clinicToys, bulky: tier.clinicBulky }, tier.clinicToys)
  await writeVouchers(vouchers)

  partners[idx] = {
    ...p,
    tier: tierKey,
    subscriptionStatus: 'active',
    paidAt: now.toISOString(),
    expiresAt: exp.toISOString(),
    patientCode,
    consultantCode: clinicCode,
    remindersSent: [], // fresh cycle → reminders can fire again next expiry
    processedCheckouts: [...(p.processedCheckouts || []), checkoutId].filter(Boolean),
  }
  await writePartners(partners)
  console.log('Partner subscription activated/renewed:', partnerId, tierKey, patientCode, clinicCode)
  return true
}
