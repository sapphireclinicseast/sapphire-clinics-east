/**
 * GET /api/templates
 *
 * Proxy for the HR hub's public templates + standardized-tests
 * endpoints, scoped to the logged-in clinician's department using
 * the SAME SCOPE_ALLOWED map the HR templates page uses (so an OT
 * sees OT + HR + Admin/Operations templates and OT-only tests).
 *
 * No auth on the upstream HR endpoint (it's a public-by-design API
 * that the HR templates UI consumes), so we don't need a Bearer
 * key — but we DO require a teletherapy session to call this proxy
 * because we use the session's department for scoping.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const HR_API_BASE = process.env.HR_API_BASE ?? 'https://hr.sapphireclinicseast.org/api'

// Mirror of the HR templates-public page's SCOPE_ALLOWED. Any change
// upstream needs to be reflected here. Keys are HR-canonical names.
const SCOPE_ALLOWED: Record<string, string[]> = {
  OT: ['OT', 'HR', 'Admin/Operations'],
  PT: ['PT', 'HR', 'Admin/Operations'],
  SLP: ['SLP', 'HR', 'Admin/Operations'],
  SPED: ['SPED', 'HR', 'Admin/Operations'],
  MD: ['MD', 'HR', 'Admin/Operations'],
  Psychology: ['Psychology', 'HR', 'Admin/Operations'],
  'Orthosis & Prosthesis': ['Orthosis & Prosthesis', 'HR', 'Admin/Operations'],
}

// Map teletherapy session.department (often UPPER_SNAKE) to HR's
// canonical name. Anything not in here is passed through verbatim
// (so admin/HR session values like "ADMIN" / "HR" still work).
function normaliseDept(dept: string): string {
  const u = dept.trim().toUpperCase()
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

interface HRTemplate {
  id: string
  templateNo: string
  templateName: string
  department: string
  internalOnly?: boolean
  link?: string
  formLink?: string
  templateSize?: string
  versionNumber?: string
  compilation?: string
  description?: string
  docxUrl?: string
  pdfUrl?: string
}
interface HRTest {
  id: string
  name: string
  department: string
  pdfUrl?: string
}

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const myRole = (session.user as { role?: string }).role ?? ''
  const myDeptRaw = (session.user as { department?: string }).department ?? ''
  const myDept = normaliseDept(myDeptRaw)
  const isAdmin = myRole === 'ADMIN'

  // Clinicians see only their scope; admins see everything.
  const allowedDepts: string[] | null = isAdmin
    ? null
    : SCOPE_ALLOWED[myDept] ?? null

  // Hit both upstream endpoints in parallel + read this user's pin list
  // from teletherapy's own DB. Pins are per-clinician (see
  // /api/templates/[id]/pin).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accountPromise = prisma.therapistAccount.findUnique({
    where: { id: session.user.id },
    select: { pinnedTemplateIds: true } as any,
  })
  const [tplRes, testRes, account] = await Promise.all([
    fetch(`${HR_API_BASE}/templates/public`, { cache: 'no-store' }),
    fetch(`${HR_API_BASE}/standardized-tests/public`, { cache: 'no-store' }),
    accountPromise,
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pinnedRaw = (account as any)?.pinnedTemplateIds
  const pinnedSet = new Set<string>(
    Array.isArray(pinnedRaw) ? pinnedRaw.filter((x): x is string => typeof x === 'string') : [],
  )
  if (!tplRes.ok) {
    return NextResponse.json({ error: `HR templates returned ${tplRes.status}` }, { status: 502 })
  }
  const tplData = (await tplRes.json()) as { ok: boolean; templates?: HRTemplate[] }
  const testData = (testRes.ok
    ? ((await testRes.json()) as { ok: boolean; tests?: HRTest[] })
    : { ok: false, tests: [] })

  const allTemplates = tplData.ok ? tplData.templates ?? [] : []
  const allTests = testData.ok ? testData.tests ?? [] : []

  // Internal-only templates are surfaced too, but flagged so the UI
  // can render them muted/disabled. Clinicians can SEE that they
  // exist (helps when troubleshooting "where is form X") but cannot
  // download them — only admins get usable links.
  const filteredTemplates = (allowedDepts === null
    ? allTemplates
    : allTemplates.filter((t) => allowedDepts.includes(t.department))
  )
    // Stable sort by department then template number for predictable UI.
    .sort((a, b) =>
      a.department.localeCompare(b.department) ||
      (a.templateNo || '').localeCompare(b.templateNo || ''),
    )

  // Standardized tests are scoped to the clinician's own department only
  // (they're tied 1:1 to discipline). Admins see all.
  const filteredTests = (isAdmin
    ? allTests
    : allTests.filter((t) => t.department === myDept)
  ).sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  // The HR docxUrl / pdfUrl are relative paths like /uploads/templates/<id>.pdf
  // served by the HR origin. Make them absolute so they work from teletherapy.
  const HR_ORIGIN = HR_API_BASE.replace(/\/api\/?$/, '')
  function abs(u?: string): string {
    if (!u) return ''
    if (/^https?:\/\//i.test(u)) return u
    return `${HR_ORIGIN}${u.startsWith('/') ? u : '/' + u}`
  }

  return NextResponse.json({
    department: myDept || null,
    allowedDepts,
    isAdmin,
    templates: filteredTemplates.map((t) => ({
      id: t.id,
      templateNo: t.templateNo,
      templateName: t.templateName,
      department: t.department,
      description: t.description ?? '',
      versionNumber: t.versionNumber ?? '',
      compilation: t.compilation ?? '',
      templateSize: t.templateSize ?? '',
      // Surface internalOnly so the UI can render those rows muted.
      // Clinicians see the row but cannot download — only admins
      // get usable docx/pdf/link/formLink for internal-only items.
      internalOnly: !!t.internalOnly,
      pinned: pinnedSet.has(t.id),
      docxUrl: t.internalOnly && !isAdmin ? '' : abs(t.docxUrl),
      pdfUrl:  t.internalOnly && !isAdmin ? '' : abs(t.pdfUrl),
      link:    t.internalOnly && !isAdmin ? '' : (t.link ?? ''),
      formLink:t.internalOnly && !isAdmin ? '' : (t.formLink ?? ''),
    })),
    standardizedTests: filteredTests.map((t) => ({
      id: t.id,
      name: t.name,
      department: t.department,
      pdfUrl: abs(t.pdfUrl),
    })),
  })
}
