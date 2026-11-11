// The waitlist: intake-form submissions that have not become patients yet.
//
// The entries live in HR Platform as form responses, not as rows here, so this
// module owns the form ids and the shape they come back in. It exists because
// two places now read the same list — Patient Relationship → Waitlist, which
// shows and chases it, and the front-desk dashboard card, which only needs to
// know how many are still untouched. Having the form ids in one place means a
// new intake route is added once rather than once per caller.

import { prisma } from '@/lib/prisma'

const HR_URLS = [
  process.env.HR_PLATFORM_URL,
  'http://172.17.0.1:3457',
  'http://172.18.0.1:3457',
  'http://host.docker.internal:3457',
  'http://127.0.0.1:3457',
].filter(Boolean) as string[]
const HR_KEY = process.env.HR_PLATFORM_API_KEY || process.env.EXTERNAL_API_KEY || ''

export async function hrFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  let lastErr: unknown = new Error('No HR URLs configured')
  for (const base of HR_URLS) {
    try {
      const res = await fetch(`${base}${path}`, {
        ...opts,
        signal: AbortSignal.timeout(5000),
        headers: { Authorization: `Bearer ${HR_KEY}`, ...opts.headers },
      })
      return res
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr
}

// ── The "what service do you need" question on an intake form ────────────────
// HR identifies this question by its title rather than by a per-form field id
// (see scei-hr-platform api/routes/forms.js, service-options), because the id
// differs on every form — JDDgcP6dDgDg on East registration, 1o03H9TqpiGY on
// Greenhills, RNzQBYx1OVfK on ALAGA. Same approach here so a new intake form
// needs no change on this side.
//
// Widened from HR's /what service/i to allow words in between: the group
// therapy forms word it "What group therapy service does the patient need?".
// Anchored at "what" so it cannot pick up "Type of Psychological Service" or
// "History of Psychological Services", which are follow-up questions about a
// service rather than the service being asked for. Verified to match exactly
// one field on each of the six waitlist forms.
export const SERVICE_QUESTION = /^\s*what\b.*\bservice/i

// HR stores "__other__" as a bare sentinel when someone ticks Other, and does
// not keep the text they typed alongside it — so there is nothing to show but
// the fact that it was Other. A handful of older submissions carry the literal
// label "Other" instead. Folded together so the column and its filter offer
// one bucket rather than two that mean the same thing.
const OTHER_LABEL = 'Other'

/** Services chosen on one form answer, in the order the patient picked them. */
export function serviceLabelsFrom(answer: any): string[] {
  if (!answer) return []
  const raw: string[] = [
    ...(Array.isArray(answer.choices?.labels) ? answer.choices.labels : []),
    answer.choices?.other,
    answer.choice?.label,
    answer.choice?.other,
  ].filter((l): l is string => typeof l === 'string' && l.trim() !== '')

  const seen = new Set<string>()
  const out: string[] = []
  for (const l of raw) {
    const label = l === '__other__' ? OTHER_LABEL : l.trim()
    if (seen.has(label)) continue
    seen.add(label)
    out.push(label)
  }
  return out
}

export const WAITLIST_FORM_TYPES: Record<string, { sbea: string; sbgh: string | null; title: string }> = {
  registration:    { sbea: 'GULaVBpI', sbgh: 'VaCB1bkE', title: 'Registration Form' },
  'group-therapy': { sbea: 'ChrSrsBF', sbgh: 'tT8QASYo', title: 'Group Therapy Registration' },
  // GH disabled — no ALAGA interns there yet
  sip:             { sbea: 'SGWVxqcW', sbgh: null, title: 'SIP Registration Form' },
  psych:           { sbea: 'X2YDKTaH', sbgh: null, title: 'Psych Registration Form' },
}

export interface WaitlistSource {
  formId: string
  branch: 'SBEA' | 'SBGH'
  title: string
  key: string
}

/** Which (form, branch) pairs a formKey covers. 'all' means every intake route. */
export function waitlistSources(formKey: string): WaitlistSource[] {
  const isAll = formKey === 'all'
  const sources: WaitlistSource[] = []
  for (const [key, f] of Object.entries(WAITLIST_FORM_TYPES)) {
    if (!isAll && key !== formKey) continue
    sources.push({ formId: f.sbea, branch: 'SBEA', title: f.title, key })
    if (f.sbgh) sources.push({ formId: f.sbgh, branch: 'SBGH', title: f.title, key })
  }
  return sources
}

/** The patient's name as the form recorded it, or '' when no name field answered. */
function nameFrom(item: any, titles: Map<string, string>): string {
  const answers: any[] = Array.isArray(item?.answers) ? item.answers : []
  for (const a of answers) {
    const title = titles.get(a?.field?.id) ?? ''
    if ((title.includes('name') && title.includes('patient')) || title.includes('name of')) {
      if (a.contact) return `${a.contact.first_name || ''} ${a.contact.last_name || ''}`.replace(/\s+/g, ' ').trim()
      if (a.text) return String(a.text).trim()
    }
  }
  const contact = answers.find(a => a?.field?.type === 'contact_info' || a?.contact)
  if (contact?.contact) {
    return `${contact.contact.first_name || ''} ${contact.contact.last_name || ''}`.replace(/\s+/g, ' ').trim()
  }
  if (contact?.text) return String(contact.text).trim()
  return ''
}

export interface LoadedWaitlist {
  responses: any[]
  /** Titles of the forms HR would not answer for. */
  failedSources: string[]
  /** True when NOTHING came back — an outage, not an empty waitlist. */
  allFailed: boolean
}

/**
 * Waitlist submissions for one formKey, newest first, branch-filtered.
 *
 * Each source is fetched in parallel and fails on its own: one unreachable form
 * leaves the rest of the list intact rather than emptying it. `allFailed` is the
 * case a caller must not render as "no one is waiting".
 */
export async function loadWaitlistResponses(
  { formKey, branch }: { formKey: string; branch?: string },
): Promise<LoadedWaitlist> {
  const sources = waitlistSources(formKey)
  const settled = await Promise.all(sources.map(async (s) => {
    try {
      const res = await hrFetch(`/forms/external/${s.formId}/responses`, { cache: 'no-store' })
      const d = await res.json()
      if (!d.ok || !d.items) return { s, items: [] as any[], fields: [] as any[], failed: !d.ok }
      return { s, items: d.items as any[], fields: (d.fields ?? []) as any[], failed: false }
    } catch {
      return { s, items: [] as any[], fields: [] as any[], failed: true }
    }
  }))

  const responses: any[] = []
  for (const { s, items, fields } of settled) {
    // HR returns the field list once per form, beside the responses, while each
    // answer carries only a field id. Resolve the questions here — once per
    // form, not once per row — and stamp what they answered onto every
    // response, so callers need know nothing about form ids.
    const serviceFieldId: string | undefined = fields.find(
      (f: any) => f?.type === 'multiple_choice' && SERVICE_QUESTION.test(f?.title ?? ''),
    )?.id
    const titles = new Map<string, string>(
      fields.filter((f: any) => f?.id).map((f: any) => [f.id as string, String(f.title ?? '').toLowerCase()]),
    )

    for (const item of items) {
      // Absent when a form has no service question at all; empty when it has
      // one the patient left blank. Both render as "—", but only the second is
      // a gap in the submission.
      const answer = serviceFieldId
        ? (item.answers ?? []).find((a: any) => a?.field?.id === serviceFieldId)
        : undefined

      responses.push({
        ...item,
        _branch: s.branch,
        _formTitle: s.title,
        _formId: s.formId,
        _formKey: s.key,
        _services: serviceLabelsFrom(answer),
        _name: nameFrom(item, titles),
      })
    }
  }

  let filtered = responses
  if (branch === 'SANDBOX_EAST') filtered = responses.filter(r => r._branch === 'SBEA')
  else if (branch === 'SANDBOX_GREENHILLS') filtered = responses.filter(r => r._branch === 'SBGH')

  filtered.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())

  const failedSources = settled.filter(r => r.failed).map(r => r.s.title)
  return {
    responses: filtered,
    failedSources,
    allFailed: sources.length > 0 && failedSources.length === sources.length,
  }
}

/**
 * Stamp front desk's follow-up state onto the responses, in place.
 *
 * One query however long the waitlist grows. A failure here leaves the list
 * untagged rather than failing the caller — the submissions are the point, the
 * tags are not.
 */
export async function attachWaitlistFollowUps(responses: any[], formKey: string): Promise<void> {
  try {
    const formIds = waitlistSources(formKey).map(s => s.formId)
    const tags = await prisma.waitlistFollowUp.findMany({ where: { formId: { in: formIds } } })
    const byKey = new Map(tags.map(t => [`${t.formId}|${t.submissionId}`, t]))
    for (const item of responses) {
      const t = byKey.get(`${item._formId}|${item.landing_id}`)
      if (t) {
        item._followUp = {
          status: t.status,
          remarks: t.remarks,
          setByName: t.setByName,
          updatedAt: t.updatedAt,
        }
      }
    }
  } catch (err) {
    console.error('[waitlist] follow-up lookup failed:', err)
  }
}
