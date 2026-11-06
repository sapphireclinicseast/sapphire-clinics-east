// Services page grouping. "COCOLIFE - MD Consult" sits under the parent
// "COCOLIFE", and services sharing a lead name collapse into one row.
// List view only: every sub-service stays its own Service row, so POS, payroll
// and reports keep picking and posting the same services they always did.

const SEPARATOR = ' - '

export function serviceParentName(name: string): string {
  const at = name.indexOf(SEPARATOR)
  return (at > 0 ? name.slice(0, at) : name).trim()
}

export function subServiceLabel(name: string): string {
  const at = name.indexOf(SEPARATOR)
  return at > 0 ? name.slice(at + SEPARATOR.length).trim() : name
}

export type ServiceGroup<T> = { kind: 'group'; key: string; label: string; services: T[] }
export type ServiceEntry<T> = { kind: 'single'; service: T } | ServiceGroup<T>

// Keeps the incoming sort: a group takes the place of its first row, and its
// rows keep their order. A lone row stays a plain row under its full name.
export function groupServices<T extends { name: string }>(services: T[]): ServiceEntry<T>[] {
  const byKey = new Map<string, T[]>()
  for (const s of services) {
    const key = serviceParentName(s.name).toUpperCase()
    const rows = byKey.get(key)
    if (rows) rows.push(s)
    else byKey.set(key, [s])
  }
  return Array.from(byKey.entries()).map(([key, rows]): ServiceEntry<T> =>
    rows.length === 1
      ? { kind: 'single', service: rows[0] }
      : { kind: 'group', key, label: serviceParentName(rows[0].name), services: rows })
}
