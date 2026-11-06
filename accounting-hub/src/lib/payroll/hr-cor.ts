// A COR uploaded in the HR Hub (Staff Profiles → COR) fills the consultant's COR
// here, so it is only uploaded once. Shared by the sync and the screens (no server
// imports). Everything that reads corUrl (the no-SI EWT sweep, the Audited income
// statement, Service Invoice reminders) treats an HR COR like any other.

export const HR_COR_URL_PREFIX = '/api/payroll/consultants/cor/hr-file/'
export const isHrCorUrl = (url?: string | null) => !!url && url.startsWith(HR_COR_URL_PREFIX)

// Mirrors WRITE_ROLES in api/payroll/consultants/cor/route.ts, plus read-only viewers.
export const HR_COR_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK', 'VIEWER']

export interface HrCorFile { id: string; originalName: string; mimetype: string; uploadedAt: string | null }
export interface HrCorStaff { hrId: string; firstName: string; lastName: string; files: HrCorFile[] }

interface ConsultantCor { id: string; name: string; corUrl: string | null; corUploadedAt: Date | null; no2303At: Date | null }
export interface CorUpdate { id: string; data: { corUrl: string | null; corUploadedAt: Date | null; no2303At?: null } }

// The hubs share no staff id for clinicians, so people are matched by name, the
// same way Operations joins its staff to the HR feed. Accents and titles differ.
export function normalizePersonName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]+/g, ' ').trim().toUpperCase()
    .replace(/^(DRA|DR) /, '')
}

/**
 * What to change so consultants match the HR Hub. A COR uploaded here is left alone.
 * An HR COR no longer in the HR Hub is cleared, unless the HR list came back empty:
 * that looks like a fault, not every COR being deleted at once.
 */
export function planCorSync(consultants: ConsultantCor[], hrStaff: HrCorStaff[], now = new Date()): { updates: CorUpdate[]; unmatched: string[] } {
  const byName = new Map(hrStaff.map(s => [normalizePersonName(`${s.firstName} ${s.lastName}`), s]))
  const matched = new Set<string>()
  const updates: CorUpdate[] = []
  for (const c of consultants) {
    const key = normalizePersonName(c.name)
    const hr = byName.get(key)
    if (hr) matched.add(key)
    if (c.corUrl && !isHrCorUrl(c.corUrl)) continue
    if (hr) {
      const corUrl = `${HR_COR_URL_PREFIX}${hr.hrId}`
      const dates = hr.files.map(f => f.uploadedAt).filter((d): d is string => !!d).sort()
      const newest = dates.length ? new Date(dates[dates.length - 1]) : null
      if (c.corUrl !== corUrl || (newest && c.corUploadedAt?.getTime() !== newest.getTime())) {
        updates.push({ id: c.id, data: { corUrl, corUploadedAt: newest ?? c.corUploadedAt ?? now, no2303At: null } })
      }
    } else if (c.corUrl && hrStaff.length > 0) {
      updates.push({ id: c.id, data: { corUrl: null, corUploadedAt: null } })
    }
  }
  const unmatched = [...byName.entries()].filter(([k]) => !matched.has(k)).map(([, s]) => `${s.firstName} ${s.lastName}`.trim())
  return { updates, unmatched }
}
