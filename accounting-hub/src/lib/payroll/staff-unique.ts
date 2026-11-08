import type { PrismaClient } from '@prisma/client'

// One number, one person (Hannah, 2026-11-08: "disallow same numbers to be
// placed in benefits numbers and bank accounts and emails if they already
// exist with another staff"). Same rules as the HR Platform
// (scei-hr-platform api/lib/staff-unique.js):
// - numbers compare by digits only, a TIN by its first 9 (branch code ignored);
// - emails compare trimmed and lower-cased;
// - values too short to be a real number ("0", "N/A") are ignored;
// - only a new or changed value is checked, so a record that already shares a
//   number still saves for other edits.
// Payroll keeps a person as an Employee AND a Consultant when they hold both
// roles (Hannah Jara, Rodel Senajon), so a match on a record with the same
// name is that person's own record, not a clash.

const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const num = (min: number) => (v: unknown) => { const d = digits(v); return d.length >= min ? d : '' }
const email = (v: unknown) => { const e = String(v ?? '').trim().toLowerCase(); return e.includes('@') ? e : '' }

export const UNIQUE_FIELDS = [
  { key: 'tinNumber', label: 'TIN', norm: (v: unknown) => { const d = digits(v); return d.length >= 9 ? d.slice(0, 9) : '' } },
  { key: 'sssNumber', label: 'SSS number', norm: num(8) },
  { key: 'philhealthNumber', label: 'PhilHealth number', norm: num(8) },
  { key: 'pagibigNumber', label: 'Pag-IBIG number', norm: num(8) },
  { key: 'bankAccountNo', label: 'bank account number', norm: num(6) },
  { key: 'email', label: 'email', norm: email },
] as const

export type UniqueKey = (typeof UNIQUE_FIELDS)[number]['key']
export type PayrollPerson = { id?: string; name: string; kind?: 'employee' | 'consultant'; firstName?: string; lastName?: string } & Partial<Record<UniqueKey, string | null>>

const TITLES = new Set(['DR', 'DRA', 'MD', 'JR', 'SR', 'II', 'III', 'IV', 'PTRP', 'OTRP', 'RSLP', 'RPM', 'RPSY', 'LPT'])
const nameTokens = (name: string) => new Set(
  name.toUpperCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .split(/[^A-Z]+/).filter(t => t.length > 1 && !TITLES.has(t)),
)
/** Same person when every name word of one record is in the other (middle names / titles may be missing). */
export function samePerson(a: string, b: string): boolean {
  const ta = nameTokens(a), tb = nameTokens(b)
  if (!ta.size || !tb.size) return false
  const sub = (x: Set<string>, y: Set<string>) => [...x].every(t => y.has(t))
  return sub(ta, tb) || sub(tb, ta)
}

export interface PayrollClash { field: UniqueKey; label: string; otherName: string; otherKind?: string; message: string }

/** First value `candidate` shares with another person's record. `before` limits the check to new/changed values. */
export function findPayrollClash(candidate: PayrollPerson, others: PayrollPerson[], before?: Partial<PayrollPerson> | null): PayrollClash | null {
  for (const f of UNIQUE_FIELDS) {
    const v = f.norm(candidate[f.key])
    if (!v) continue
    if (before && f.norm(before[f.key]) === v) continue
    const hit = others.find(o =>
      !(candidate.id && o.id === candidate.id && o.kind === candidate.kind) &&
      f.norm(o[f.key]) === v &&
      !samePerson(candidate.name, o.name))
    if (hit) {
      const role = hit.kind ? ` (${hit.kind})` : ''
      return {
        field: f.key, label: f.label, otherName: hit.name, otherKind: hit.kind,
        message: `This ${f.label} is already on ${hit.name}'s payroll record${role}. Each ${f.label} can belong to one person only — check which of the two it really belongs to (fix it in the HR Platform if it came from there).`,
      }
    }
  }
  return null
}

const SELECT = { id: true, tinNumber: true, sssNumber: true, philhealthNumber: true, pagibigNumber: true, bankAccountNo: true, email: true } as const

/** Every Employee and Consultant record, in the shape findPayrollClash compares. */
export async function loadPayrollPeople(prisma: PrismaClient): Promise<PayrollPerson[]> {
  const [emps, cons] = await Promise.all([
    prisma.employee.findMany({ select: { ...SELECT, firstName: true, lastName: true } }),
    prisma.consultant.findMany({ select: { ...SELECT, name: true } }),
  ])
  return [
    ...emps.map(e => ({ ...e, name: `${e.firstName} ${e.lastName}`.trim(), kind: 'employee' as const })),
    ...cons.map(c => ({ ...c, kind: 'consultant' as const })),
  ]
}
