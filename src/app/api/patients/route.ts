import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Papa from 'papaparse'
import { validateBranches } from '@/lib/branch-options'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Uppercase a string field; pass-through null/undefined */
function uc(v: string | null | undefined): string | null {
  if (!v) return v ?? null
  return v.trim().toUpperCase()
}

function getAge(dob: Date): number {
  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  const m = now.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--
  return age
}

function computePatientType(dob: Date): 'PEDIATRIC' | 'ADULT' {
  return getAge(dob) <= 17 ? 'PEDIATRIC' : 'ADULT'
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, '')
}

function isSimilarName(a: string, b: string): boolean {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.includes(nb) || nb.includes(na)) return true
  const threshold = Math.max(na.length, nb.length) <= 6 ? 1 : 2
  return levenshtein(na, nb) <= threshold
}

function parseName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim()
  if (trimmed.includes(',')) {
    const [last, ...firstParts] = trimmed.split(',')
    return { firstName: firstParts.join(',').trim(), lastName: last.trim() }
  }
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

function parseDate(s: string): Date | null {
  if (!s || !s.trim()) return null
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d
  const m = s.match(/(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{4})/)
  if (m) {
    const attempt = new Date(`${m[2]} ${m[1]}, ${m[3]}`)
    if (!isNaN(attempt.getTime())) return attempt
  }
  return null
}

function branchLabel(branch: string): string {
  return { SANDBOX_EAST: 'East Branch', SANDBOX_GREENHILLS: 'Greenhills Branch', VERDANA_STORE: 'Verdana Store' }[branch] ?? branch
}

// ─── GET: list patients or export as CSV ─────────────────────────────────────

const MAIN_ADMIN_EMAIL = 'main@sapphireclinicseast.org'

const ROLE_BRANCH: Record<string, string> = {
  AHEA_FRONT_DESK: 'SANDBOX_EAST',
  AHGH_FRONT_DESK: 'SANDBOX_GREENHILLS',
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as { role?: string }).role ?? ''
  const forcedBranch = ROLE_BRANCH[role] ?? null  // non-null → front desk (still governs WRITES)

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const search = searchParams.get('search')
  // READS are not branch-scoped. Front desk needs the whole register: a patient
  // registered at one branch is routinely seen at the other, and hiding them
  // was what produced 31 duplicate name groups — the desk looked, found
  // nothing, and created a second record. Writes stay scoped below.
  const branch = searchParams.get('branch')
  const exportCsv = searchParams.get('export') === 'csv'
  if (exportCsv) {
    const userEmail = (session.user as { email?: string }).email ?? ''
    if (userEmail.toLowerCase() !== MAIN_ADMIN_EMAIL) {
      return NextResponse.json(
        { error: 'CSV export is restricted to the main admin account.' },
        { status: 403 },
      )
    }
  }
  // Branch filter — front desk is locked to their branch; otherwise honor the
  // singular `branch` or comma-separated `branches` query param. Applies to all
  // requests (count, listing, export), not just CSV export.
  const requestedBranches = searchParams.get('branches')?.split(',').filter(Boolean)
        ?? (branch ? [branch] : [])

  // Raw SQL pre-filter for branch (avoids enum array type mismatch with PrismaPg driver adapter)
  let branchFilterIds: string[] | null = null

  if (requestedBranches.length > 0) {
    const placeholders = requestedBranches.map((_, i) => `$${i + 1}`).join(', ')
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT DISTINCT id FROM "Patient" WHERE branch::text = ANY(ARRAY[${placeholders}]) OR "branches"::text[] && ARRAY[${placeholders}]`,
      ...requestedBranches,
    )
    branchFilterIds = rows.map(r => r.id)
  }

  const where: any = {
    ...(branchFilterIds !== null ? { id: { in: branchFilterIds } } : {}),
    ...(type ? { patientType: type as any } : {}),
    ...(search ? {
      OR: [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ],
    } : {}),
  }

  const patients = await prisma.patient.findMany({ where, orderBy: { lastName: 'asc' } })

  // Cross-branch miss recovery. A front desk searching for someone registered at
  // the other branch finds nothing and reasonably concludes they are new — which
  // is how ROCHEL RAMOS ended up existing twice, once per branch. So when a
  // scoped SEARCH returns nothing, look again across all branches and return the
  // matches separately, flagged. They are never mixed into `patients`, never
  // appear without a search term, and are not editable until the branch is added
  // via PATCH below — the branch boundary still holds, the dead end does not.
  let outOfBranch: typeof patients = []
  if (forcedBranch && search && patients.length === 0 && !exportCsv) {
    outOfBranch = await prisma.patient.findMany({
      where: {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      },
      orderBy: { lastName: 'asc' },
      take: 25,
    })
  }

  if (exportCsv) {
    const now = new Date()
    const rows = patients.map((p: any) => {
      const allBranches = p.branches?.length > 0 ? p.branches : (p.branch ? [p.branch] : [])
      return {
        'Date of Registration': p.createdAt.toLocaleDateString('en-PH'),
        'Last Name':   p.lastName  ?? '',
        'First Name':  p.firstName ?? '',
        Birthday:      p.dob ? p.dob.toLocaleDateString('en-PH') : '',
        Age:           p.dob ? String(getAge(p.dob)) : '',
        Email:         p.email ?? '',
        'Civil Status': p.civilStatus ?? '',
        Sex:            p.sex ?? '',
        Diagnosis_Group: p.diagnosis ?? '',
        Religion:        p.religion ?? '',
        Barangay:        p.address ?? '',
        City:            p.city ?? '',
        Nationality:     p.nationality ?? '',
        'Cellphone No.': p.phone ?? '',
        Type:   p.patientType === 'PEDIATRIC' ? 'Pediatric' : 'Adult',
        Branch: allBranches.map(branchLabel).join('; '),
      }
    })
    const csv = Papa.unparse(rows)
    const filename = `patients-${now.toISOString().slice(0, 10)}.csv`
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  return NextResponse.json({ patients, outOfBranch })
}

/**
 * PATCH /api/patients  { id, addBranch }
 *
 * Adds one branch to an existing patient's branches[]. This is the front desk's
 * way out of the cross-branch dead end: rather than re-creating someone who is
 * already registered elsewhere, they attach their own branch to the existing
 * record. Deliberately the only field this touches — it cannot rename a patient
 * or move them, only widen where they are seen.
 */
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as { role?: string }).role ?? ''
  const forcedBranch = ROLE_BRANCH[role] ?? null

  const body = await req.json().catch(() => ({}))
  const id = String(body.id ?? '')
  const addBranch = String(body.addBranch ?? '')
  if (!id || !addBranch) {
    return NextResponse.json({ error: 'id and addBranch are required' }, { status: 400 })
  }
  if (!validateBranches([addBranch])) {
    return NextResponse.json({ error: 'Unknown branch' }, { status: 400 })
  }
  // Front desk may only add THEIR branch. Without this they could quietly add a
  // patient to a branch they have no business touching.
  if (forcedBranch && addBranch !== forcedBranch) {
    return NextResponse.json({ error: 'You can only add your own branch' }, { status: 403 })
  }

  const patient = await prisma.patient.findUnique({
    where: { id },
    select: { id: true, branch: true, branches: true, firstName: true, lastName: true },
  })
  if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 })

  // branches[] is the current field; `branch` is the legacy single one and most
  // rows carry only branches[]. Seed from whichever is populated so a legacy row
  // does not lose its original branch when the new one is appended.
  const current = patient.branches?.length
    ? patient.branches
    : (patient.branch ? [patient.branch] : [])
  if (current.includes(addBranch)) {
    return NextResponse.json({ patient, alreadyPresent: true })
  }

  const updated = await prisma.patient.update({
    where: { id },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { branches: { set: [...current, addBranch] as any } },
    select: { id: true, firstName: true, lastName: true, branch: true, branches: true },
  })
  return NextResponse.json({ patient: updated })
}

// ─── POST: import CSV or create single patient ────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Needed by both arms below (CSV import and single create), so it is resolved
  // once here rather than separately inside each.
  const role = (session.user as { role?: string }).role ?? ''
  const forcedBranch = ROLE_BRANCH[role] ?? null

  const contentType = req.headers.get('content-type') || ''

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'File required' }, { status: 400 })

    // Multi-branch: CSV rows land at every branch the importer ticked. The
    // single `branch` field is still accepted so an older client (or a saved
    // duplicate-review payload) keeps working.
    const rawBranches = form.get('branches') as string | null
    let submittedBranches: string[] = []
    if (rawBranches) {
      try { submittedBranches = JSON.parse(rawBranches) } catch { submittedBranches = [] }
    } else {
      const single = (form.get('branch') as string | null) || null
      if (single) submittedBranches = [single]
    }
    // A front-desk user imports to their own branch, whatever the form said.
    if (forcedBranch) submittedBranches = [forcedBranch]

    const { valid: importBranches, invalid } = await validateBranches(submittedBranches)
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Unknown branch: ${invalid.join(', ')}` },
        { status: 400 },
      )
    }

    const force = form.get('force') === 'true'

    const text = await file.text()
    const { data } = Papa.parse(text, { header: true, skipEmptyLines: true })

    const existingPatients = await prisma.patient.findMany({
      select: { id: true, firstName: true, lastName: true, dob: true },
    })

    const imported: number[] = []
    const duplicates: Array<{ csvRow: any; existing: any }> = []

    for (const row of data as any[]) {
      // ── New format: Last Name / First Name columns (primary) ──────────────
      // ── Legacy format: combined Name column (fallback) ────────────────────
      const rawFirstName = row['First Name'] || row['first name'] || row.firstName || row.first_name || row.first
      const rawLastName  = row['Last Name']  || row['last name']  || row.lastName  || row.last_name  || row.last
      const rawName      = row['Name'] || row.name

      let firstName: string, lastName: string
      if (rawFirstName || rawLastName) {
        firstName = (rawFirstName || '').trim()
        lastName  = (rawLastName  || '').trim()
      } else if (rawName) {
        const parsed = parseName(rawName)
        firstName = parsed.firstName
        lastName  = parsed.lastName
      } else {
        continue   // no name — skip row
      }

      if (!firstName) continue

      // ── Date fields ───────────────────────────────────────────────────────
      const rawBirthday = row['Birthday'] || row.birthday || row.dob || row.DOB || row['Date of Birth']
      const dob         = parseDate(rawBirthday)
      const patientType = dob ? computePatientType(dob) : 'ADULT'

      // ── Contact ───────────────────────────────────────────────────────────
      const email = row['Email'] || row.email || null
      const phone = row['Cellphone No.'] || row['Cellphone No'] || row['Cellphone'] || row.phone || row.Phone || row.mobile || null

      // ── Demographics ──────────────────────────────────────────────────────
      const rawSex         = row['Sex']          || row.sex        || row.gender   || null
      const rawCivilStatus = row['Civil Status'] || row.civilStatus || row['civil_status'] || null
      const rawReligion    = row['Religion']     || row.religion   || null
      const rawNationality = row['Nationality']  || row.nationality || null

      // ── Location: Barangay → address, City → city ─────────────────────────
      const rawBarangay = row['Barangay'] || row.barangay || row['Address'] || row.address || null
      const rawCity     = row['City']     || row.city     || null

      // ── Diagnosis ─────────────────────────────────────────────────────────
      const rawDiagnosis = row['Diagnosis_Group'] || row['Diagnosis Group'] || row['Diagnosis'] || row.diagnosis || null

      if (!force) {
        const dup = existingPatients.find((ep) => {
          const firstMatch = isSimilarName(ep.firstName, firstName)
          const lastMatch = lastName ? isSimilarName(ep.lastName, lastName) : true
          if (!firstMatch || !lastMatch) return false
          if (dob && ep.dob) {
            const epDate = new Date(ep.dob)
            return (
              epDate.getFullYear() === dob.getFullYear() &&
              epDate.getMonth() === dob.getMonth() &&
              epDate.getDate() === dob.getDate()
            )
          }
          return true
        })
        if (dup) {
          duplicates.push({ csvRow: row, existing: dup })
          continue
        }
      }

      // branch stays the legacy first-of-list; branches is the real answer.
      await prisma.patient.create({
        data: {
          firstName,
          lastName,
          email:       email       || null,
          phone:       phone       || null,
          dob:         dob         ?? null,
          patientType: patientType as any,
          branch:      importBranches[0] || null,
          branches:    importBranches,
          sex:         rawSex         || null,
          civilStatus: rawCivilStatus || null,
          religion:    rawReligion    || null,
          nationality: rawNationality || null,
          address:     rawBarangay    || null,
          city:        rawCity        || null,
          diagnosis:   rawDiagnosis   || null,
        },
      })
      imported.push(1)
    }

    return NextResponse.json({ imported: imported.length, duplicates })
  }

  // Single patient creation
  const body = await req.json()

  const dob = body.dob ? new Date(body.dob) : null
  const patientType = dob ? computePatientType(dob) : (body.patientType || 'ADULT')
  // Front desk users may only create patients for their own branch
  const branches: string[] = forcedBranch
    ? [forcedBranch]
    : (body.branches ?? (body.branch ? [body.branch] : []))

  const { invalid: invalidCreate } = await validateBranches(branches)
  if (invalidCreate.length > 0) {
    return NextResponse.json({ error: `Unknown branch: ${invalidCreate.join(', ')}` }, { status: 400 })
  }

  // Same-name guard. The register already holds 31 name collisions, most of
  // them one person entered twice — usually because the front desk could not
  // see a record held at the other branch and re-created it. Search across ALL
  // branches (not just this user's) so a cross-branch duplicate is caught,
  // and answer 409 with the matches so the UI can offer the existing record
  // before a second one is made. `confirmDuplicate` is the deliberate override
  // for genuine namesakes, which do exist.
  if (!body.confirmDuplicate) {
    const first = (uc(body.firstName) ?? '').trim()
    const last  = (uc(body.lastName)  ?? '').trim()
    if (first && last) {
      const sameName = await prisma.patient.findMany({
        where: {
          firstName: { equals: first, mode: 'insensitive' },
          lastName:  { equals: last,  mode: 'insensitive' },
        },
        select: { id: true, firstName: true, lastName: true, dob: true, phone: true, email: true, branches: true, branch: true },
        take: 10,
      })
      if (sameName.length > 0) {
        return NextResponse.json({ duplicateWarning: true, matches: sameName }, { status: 409 })
      }
    }
  }

  const patient = await prisma.patient.create({
    data: {
      firstName:   uc(body.firstName) ?? '',
      lastName:    uc(body.lastName)  ?? '',
      email:       body.email         || null,
      phone:       uc(body.phone)     || null,
      dob,
      patientType: patientType as any,
      branch:      (branches[0] as any) || null,
      branches:    branches as any,
      sex:         uc(body.sex)         || null,
      civilStatus: uc(body.civilStatus) || null,
      religion:    uc(body.religion)    || null,
      nationality: uc(body.nationality) || null,
      address:     uc(body.address)     || null,
      city:        uc(body.city)        || null,
      diagnosis:   uc(body.diagnosis)   || null,
      notes:       uc(body.notes)       || null,
      pwdSeniorId: uc(body.pwdSeniorId) || null,
      firstDayOfConsult: body.firstDayOfConsult ? new Date(body.firstDayOfConsult) : null,
      unsubscribed: !!body.unsubscribed,
      smsUnsubscribed: !!body.smsUnsubscribed,
    },
  })

  return NextResponse.json({ patient })
}

// ─── PUT: edit a single patient ───────────────────────────────────────────────

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const forcedBranchPut = ROLE_BRANCH[(session.user as { role?: string }).role ?? ''] ?? null

  const body = await req.json()
  const {
    id, firstName, lastName, email, phone, dob, branches,
    sex, civilStatus, religion, nationality, address, city, diagnosis, notes,
    firstDayOfConsult, pwdSeniorId, unsubscribed, smsUnsubscribed,
  } = body

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const dobDate = dob ? new Date(dob) : undefined
  const patientType = dobDate ? computePatientType(dobDate) : undefined

  const updateData: any = {}
  if (firstName    !== undefined) updateData.firstName    = uc(firstName)    ?? ''
  if (lastName     !== undefined) updateData.lastName     = uc(lastName)     ?? ''
  if (email        !== undefined) updateData.email        = email             || null
  if (phone        !== undefined) updateData.phone        = uc(phone)         || null
  if (dobDate      !== undefined) {
    updateData.dob = dobDate
    if (patientType) updateData.patientType = patientType
  }
  if (branches     !== undefined) {
    // A front-desk user may ADD their own branch but never remove another.
    // This used to overwrite the set with [theirBranch], which was harmless
    // only because they could not see the other branch's patients. Now that
    // reads span both branches, overwriting would silently strip a patient's
    // other branch the first time the wrong desk edited them — turning a
    // routine edit into data loss for an interbranch patient.
    let wanted: string[] = branches
    if (forcedBranchPut) {
      const current = await prisma.patient.findUnique({
        where: { id },
        select: { branches: true, branch: true },
      })
      const existing = current
        ? (current.branches.length > 0 ? current.branches : (current.branch ? [current.branch] : []))
        : []
      wanted = [...new Set([...existing, forcedBranchPut])]
    }
    const { valid, invalid } = await validateBranches(wanted)
    if (invalid.length > 0) {
      return NextResponse.json({ error: `Unknown branch: ${invalid.join(', ')}` }, { status: 400 })
    }
    updateData.branches = valid
    updateData.branch   = valid[0] || null   // keep legacy field in sync
  }
  if (sex          !== undefined) updateData.sex          = uc(sex)          || null
  if (civilStatus  !== undefined) updateData.civilStatus  = uc(civilStatus)  || null
  if (religion     !== undefined) updateData.religion     = uc(religion)     || null
  if (nationality  !== undefined) updateData.nationality  = uc(nationality)  || null
  if (address      !== undefined) updateData.address      = uc(address)      || null
  if (city         !== undefined) updateData.city         = uc(city)         || null
  if (diagnosis    !== undefined) updateData.diagnosis    = uc(diagnosis)    || null
  if (notes        !== undefined) updateData.notes        = uc(notes)        || null
  if (firstDayOfConsult !== undefined) updateData.firstDayOfConsult = firstDayOfConsult ? new Date(firstDayOfConsult) : null
  if (unsubscribed !== undefined) updateData.unsubscribed = !!unsubscribed
  if (smsUnsubscribed !== undefined) updateData.smsUnsubscribed = !!smsUnsubscribed
  if (pwdSeniorId       !== undefined) updateData.pwdSeniorId       = uc(pwdSeniorId) || null

  const patient = await prisma.patient.update({
    where: { id },
    data: updateData,
  })

  return NextResponse.json({ patient })
}

// ─── DELETE: remove a single patient ─────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await prisma.patient.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
