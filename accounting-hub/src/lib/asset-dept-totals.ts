// Asset totals per department (Hannah 2026-11-05). A piece with its own departments
// counts under those, else under the asset's. A piece serving several departments is
// shared equally between them, so the costs add up to the register total instead of
// counting it once per department.
import { pieceDepartments, type AssetUnit } from './asset-units'

export const NO_DEPARTMENT = 'No department'

export interface DeptAsset {
  id: string
  name: string
  controlNumber: string | null
  branch: string
  classification: string
  quantity: number
  totalAmount: number
  monthlyDepreciation: number
  yearsDepreciation: number
  dateBought: string
  departments?: unknown
  units?: unknown
}

export interface DeptLine {
  assetId: string
  controlNumber: string | null
  name: string
  branch: string
  classification: string
  pieces: number
  shared: boolean // also counted under another department
  cost: number
  monthly: number
  accumulated: number
}

export interface DeptTotal {
  department: string
  records: number
  items: number
  cost: number
  monthly: number
  accumulated: number
  bookValue: number
  lines: DeptLine[]
}

// Same count as the asset's details: the purchase month is the first month.
function accumulatedOf(a: DeptAsset, now: Date) {
  const life = a.yearsDepreciation * 12
  const bought = new Date(a.dateBought)
  const elapsed = life > 0
    ? Math.max(0, Math.min(life, (now.getUTCFullYear() - bought.getUTCFullYear()) * 12 + (now.getUTCMonth() - bought.getUTCMonth()) + 1))
    : 0
  return Math.min(Number(a.totalAmount), elapsed * Number(a.monthlyDepreciation))
}

export function departmentTotals(assets: DeptAsset[], now = new Date()): DeptTotal[] {
  const byDept = new Map<string, Map<string, DeptLine>>()
  for (const a of assets) {
    const total = Number(a.totalAmount) || 0
    const monthly = Number(a.monthlyDepreciation) || 0
    const accumulated = accumulatedOf(a, now)
    const depts = pieceDepartments(a.departments, a.units, a.quantity)
    const units = a.quantity > 1 && Array.isArray(a.units) && a.units.length ? (a.units as AssetUnit[]) : null
    // Each piece's share of the asset: its own price, else an even share.
    const values = units ? units.map(u => (u?.price != null ? Number(u.price) : total / a.quantity)) : [1]
    const sum = values.reduce((s, v) => s + v, 0)
    values.forEach((v, i) => {
      const share = sum > 0 ? v / sum : 1 / values.length
      const own = depts[i]?.length ? depts[i] : [NO_DEPARTMENT]
      for (const d of own) {
        const lines = byDept.get(d) || new Map<string, DeptLine>()
        const line = lines.get(a.id) || {
          assetId: a.id, controlNumber: a.controlNumber, name: a.name, branch: a.branch, classification: a.classification,
          pieces: 0, shared: false, cost: 0, monthly: 0, accumulated: 0,
        }
        line.pieces += units ? 1 : (a.quantity || 1)
        line.shared = line.shared || own.length > 1
        line.cost += (total * share) / own.length
        line.monthly += (monthly * share) / own.length
        line.accumulated += (accumulated * share) / own.length
        lines.set(a.id, line)
        byDept.set(d, lines)
      }
    })
  }
  const rows = [...byDept.entries()].map(([department, map]) => {
    const lines = [...map.values()].sort((x, y) => y.cost - x.cost)
    const cost = lines.reduce((s, l) => s + l.cost, 0)
    const accumulated = lines.reduce((s, l) => s + l.accumulated, 0)
    return {
      department, lines, cost, accumulated, bookValue: cost - accumulated,
      records: lines.length,
      items: lines.reduce((s, l) => s + l.pieces, 0),
      monthly: lines.reduce((s, l) => s + l.monthly, 0),
    }
  })
  return rows.sort((x, y) => (x.department === NO_DEPARTMENT ? 1 : y.department === NO_DEPARTMENT ? -1 : y.cost - x.cost))
}
