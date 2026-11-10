// HR Hub "Templates" catalog: every form's code (templateNo, e.g. ADMIN23) and
// name (e.g. Patient/Client Referral Form), per department. Public, no auth.
// Base URL defaults to the live templates subdomain; override with HR_TEMPLATES_URL.
const HR_TEMPLATES_URL = (process.env.HR_TEMPLATES_URL || 'https://templates.sapphireclinicseast.org').replace(/\/$/, '')

export interface FormTemplate { templateNo: string; templateName: string; department: string; massProduced: boolean }

/** The catalog, de-duplicated; [] when it can't be reached in time. */
export async function fetchFormTemplates(timeoutMs = 8000): Promise<FormTemplate[]> {
  try {
    const res = await fetch(`${HR_TEMPLATES_URL}/api/templates/public`, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return []
    const data = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = Array.isArray(data?.templates) ? (data.templates as any[]) : []
    const seen = new Set<string>()
    return raw
      .map((t) => ({
        templateNo: String(t?.templateNo || '').trim(),
        templateName: String(t?.templateName || '').trim(),
        department: String(t?.department || '').trim() || 'Other',
        massProduced: /^y/i.test(String(t?.massProduced || '')),
      }))
      .filter((t) => t.templateNo || t.templateName)
      // De-dupe (the catalog has a few exact repeats, e.g. PT08).
      .filter((t) => {
        const k = `${t.templateNo}|${t.templateName}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
  } catch {
    return []
  }
}

/** Form code → name, e.g. { ADMIN23: 'Patient/Client Referral Form' }. */
export async function formTemplateNames(timeoutMs = 4000): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const t of await fetchFormTemplates(timeoutMs)) if (t.templateNo && t.templateName && !out[t.templateNo]) out[t.templateNo] = t.templateName
  return out
}
