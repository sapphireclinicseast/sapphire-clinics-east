/**
 * Department scoping for HR-hub manuals, shared by the /api/manuals
 * proxy routes. Mirrors the SCOPE_ALLOWED / normaliseDept logic used
 * by the Templates proxy (src/app/api/templates/route.ts) so a
 * clinician sees manuals tagged for their discipline plus shared
 * HR / Admin-Operations manuals. Keys are HR-canonical names.
 */

export const SCOPE_ALLOWED: Record<string, string[]> = {
  OT: ['OT', 'HR', 'Admin/Operations'],
  PT: ['PT', 'HR', 'Admin/Operations'],
  SLP: ['SLP', 'HR', 'Admin/Operations'],
  SPED: ['SPED', 'HR', 'Admin/Operations'],
  MD: ['MD', 'HR', 'Admin/Operations'],
  Psychology: ['Psychology', 'HR', 'Admin/Operations'],
  'Orthosis & Prosthesis': ['Orthosis & Prosthesis', 'HR', 'Admin/Operations'],
}

/** Map a teletherapy session.department (often UPPER_SNAKE) to HR's canonical name. */
export function normaliseDept(dept: string): string {
  const u = (dept || '').trim().toUpperCase()
  const map: Record<string, string> = {
    OT: 'OT',
    PT: 'PT',
    SLP: 'SLP',
    SPED: 'SPED',
    MD: 'MD',
    PSYCH: 'Psychology',
    PSYCHOLOGY: 'Psychology',
    ORTHOSIS: 'Orthosis & Prosthesis',
    'ORTHOSIS & PROSTHESIS': 'Orthosis & Prosthesis',
  }
  return map[u] ?? dept
}

/**
 * The set of department tags a user is allowed to see, or `null` for
 * admins (who see everything). An unmapped department falls back to
 * its own (normalised) name only.
 */
export function allowedDeptsFor(role: string, departmentRaw: string): string[] | null {
  if (role === 'ADMIN') return null
  const d = normaliseDept(departmentRaw)
  return SCOPE_ALLOWED[d] ?? (d ? [d] : [])
}

/** Does this manual's department tags intersect the user's allowed scope? */
export function manualInScope(manualDepartments: string[], allowed: string[] | null): boolean {
  if (allowed === null) return true
  return (manualDepartments || []).some((d) => allowed.includes(d))
}
