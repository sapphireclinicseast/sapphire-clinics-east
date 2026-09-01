// Department → colour, for charts and boards that show several departments at
// once.
//
// Values match the palette already used by the interdepartmental stats and the
// patient dashboard breakdown, so a department keeps the same colour wherever it
// appears. ORTHOSIS is added here: those screens only chart the six "focus"
// departments, but Decking carries all seven.
//
// Deliberately NOT wired into the existing screens — they each hold their own
// copy today, and rewriting them to import this belongs in its own change. A
// half-applied refactor of exactly this kind (branch-label) once left a
// duplicate definition behind and broke every build.

export const DEPT_COLORS: Record<string, string> = {
  OT:         '#1A7B8A',
  PT:         '#2AAABB',
  SLP:        '#F59E0B',
  SPED:       '#8B5CF6',
  MD:         '#DC2626',
  PSYCHOLOGY: '#7C3AED',
  ORTHOSIS:   '#059669',
}

// Falls back to a neutral grey rather than undefined: an unrecognised department
// should still render as a visible row, just uncoloured.
export function deptColor(dept: string): string {
  return DEPT_COLORS[dept] ?? '#94A3B8'
}
