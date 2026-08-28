// Keeps each teletherapy login email (TherapistAccount.email) in step with the
// HR/Ops source of truth (Staff.email). When they diverge, the account adopts
// the staff email and the previous login email is kept as an alias so the
// person can still sign in with either address — an email change never locks
// anyone out. Skips blank staff emails and any target already used by a
// different account (to respect the unique constraint).

import { prisma } from '@/lib/prisma'

const clean = (e: string | null | undefined) => (e ?? '').toLowerCase().trim()
const isEmail = (e: string) => e.includes('@') && !e.startsWith('@') && !e.endsWith('@')

/** Reconcile a single account (already loaded with its staff email). Returns
 *  the email the account should now use. Safe to call on every login. */
export async function reconcileAccountEmail(account: {
  id: string; email: string; emailAliases?: string[]; staff?: { email: string | null } | null
}): Promise<string> {
  const current = clean(account.email)
  const canonical = clean(account.staff?.email)
  if (!canonical || !isEmail(canonical) || canonical === current) return account.email

  const clash = await prisma.therapistAccount.findFirst({
    where: { email: canonical, NOT: { id: account.id } }, select: { id: true },
  })
  if (clash) return account.email // target taken — leave login as-is

  const aliases = Array.from(new Set([...(account.emailAliases ?? []).map(clean), current]))
    .filter((e) => e && e !== canonical)
  try {
    await prisma.therapistAccount.update({ where: { id: account.id }, data: { email: canonical, emailAliases: aliases } })
    return canonical
  } catch {
    return account.email // e.g. a race on the unique constraint — leave as-is
  }
}

/** Reconcile every account. Called when the admin account list is read so the
 *  panel always reflects the current staff emails, and usable as a backfill. */
export async function reconcileAllAccountEmails(): Promise<number> {
  const accounts = await prisma.therapistAccount.findMany({
    select: { id: true, email: true, emailAliases: true, staff: { select: { email: true } } },
  })
  let changed = 0
  for (const a of accounts) {
    const before = a.email
    const after = await reconcileAccountEmail(a)
    if (after !== before) changed++
  }
  return changed
}
