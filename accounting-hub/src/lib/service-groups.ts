// Services page grouping. "COCOLIFE - MD Consult" sits under the parent
// "COCOLIFE", services sharing a lead name collapse into one row, and "Move under
// a parent" can file any service under another without touching its name.
// List view only: every sub-service stays its own Service row, so POS, payroll
// and reports keep picking and posting the same services they always did.

const SEPARATOR = ' - '

type Groupable = { name: string; parentGroup?: string | null }

export function parentFromName(name: string): string {
  const at = name.indexOf(SEPARATOR)
  return (at > 0 ? name.slice(0, at) : name).trim()
}

export function serviceParentName(s: Groupable): string {
  return s.parentGroup?.trim() || parentFromName(s.name)
}

export function subServiceLabel(s: Groupable): string {
  const prefix = `${serviceParentName(s)}${SEPARATOR}`
  return s.name.toUpperCase().startsWith(prefix.toUpperCase()) ? s.name.slice(prefix.length).trim() : s.name
}

export type ServiceGroup<T> = { kind: 'group'; key: string; label: string; services: T[] }
export type ServiceEntry<T> = { kind: 'single'; service: T } | ServiceGroup<T>

// Keeps the incoming sort: a group takes the place of its first row, and its
// rows keep their order. A lone row stays a plain row under its full name,
// unless it was moved under a parent on purpose.
export function groupServices<T extends Groupable>(services: T[]): ServiceEntry<T>[] {
  const byKey = new Map<string, T[]>()
  for (const s of services) {
    const key = serviceParentName(s).toUpperCase()
    const rows = byKey.get(key)
    if (rows) rows.push(s)
    else byKey.set(key, [s])
  }
  return Array.from(byKey.entries()).map(([key, rows]): ServiceEntry<T> =>
    rows.length === 1 && !rows[0].parentGroup?.trim()
      ? { kind: 'single', service: rows[0] }
      : { kind: 'group', key, label: serviceParentName(rows[0]), services: rows })
}

export function parentOptions(services: Groupable[]): string[] {
  const byKey = new Map<string, string>()
  for (const s of services) {
    const label = serviceParentName(s)
    if (!byKey.has(label.toUpperCase())) byKey.set(label.toUpperCase(), label)
  }
  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b))
}
