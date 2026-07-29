import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { fetchExternalStaffForSync } from '@/lib/external-staff'
import { consultantBranchesOf } from '@/lib/branch-roles'
import { recordStaffSync } from '@/lib/staff-directory'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

// Consultants store branch as SBEA/SBGH/VERDANA/AHI; orders store the long branch code.
const BRANCH_TO_ORDER: Record<string, string> = {
  SBEA: 'SANDBOX_EAST', SBGH: 'SANDBOX_GREENHILLS', VERDANA: 'VERDANA_STORE', AHI: 'AURA_INSTITUTE',
}
const BRANCH_CODES = Object.keys(BRANCH_TO_ORDER)

/** Branch-specific roles can only see their branch + VERDANA */
function allowedBranches(role: string): string[] | null {
  if (role === 'AHEA_ADMIN') return ['SBEA', 'VERDANA']
  if (role === 'AHGH_ADMIN') return ['SBGH', 'VERDANA']
  if (role === 'VERDANA_ADMIN') return ['VERDANA']
  return null
}

/** Format name as ALL CAPS: "FIRSTNAME LASTNAME" */
function formatName(s: string): string {
  return s.toUpperCase()
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch') || ''
  const department = searchParams.get('department') || ''
  const sync = searchParams.get('sync') === 'true'

  // Optionally sync external staff (Operations for Aura Health branches, HR Platform for Verdana)
  if (sync) {
    try {
      // includeInactive so a resignation arrives as a flag we can act on rather than as an
      // absence we have to guess about; recordStaffSync keeps our own copy of who we saw.
      const staff = await fetchExternalStaffForSync({ includeInactive: true })
      if (staff.length > 0) {
        const directory = await recordStaffSync(staff, 'OPERATIONS')
        const syncedExternalIds = new Set<string>()

        // Phase 1: Clean existing duplicates (same name + same branch, prefer one with externalStaffId)
        const allConsultants = await prisma.consultant.findMany({ where: { isActive: true } })
        const seenNames = new Map<string, typeof allConsultants[0]>()
        for (const c of allConsultants) {
          const key = `${c.name.toUpperCase()}|${c.branch}`
          const prev = seenNames.get(key)
          if (prev) {
            const keep = c.externalStaffId && !prev.externalStaffId ? c : prev
            const remove = keep === c ? prev : c
            await prisma.consultant.update({ where: { id: remove.id }, data: { isActive: false } })
            seenNames.set(key, keep)
          } else {
            seenNames.set(key, c)
          }
        }

        // Phase 2: Sync from marketing hub
        for (const s of staff) {
          const name = formatName(`${s.firstName} ${s.lastName}`)
          const dept = s.department || ''
          const br = s.branch || ''
          // Skip front desk, and anyone the source marks as an employee — they belong
          // in the Employees tab, not Consultants (employmentType==='employee' is the
          // same discriminator the Employee sync uses; clinicians carry a different type).
          // Not adding their id to syncedExternalIds lets Phase 3 deactivate any that were
          // previously mis-synced as consultants.
          if (dept === 'FRONT_DESK') continue
          // Resigned upstream. Leave them out of syncedExternalIds so Phase 3 retires them,
          // and never re-create them: this is the signal the directory exists to give us.
          if (directory.inactiveIds.has(String(s.id))) continue

          // Per-branch role override (set in Operations → Staff Profiles). Someone can be a
          // consultant at one branch and an employee at another, which the single
          // employmentType can't express. A branch listed as 'consultant' here keeps them in
          // this tab even when the profile says employee — and pins them to that branch.
          const consultantBranches = consultantBranchesOf(s)
          if (consultantBranches.length === 0 && s.employmentType === 'employee') continue

          syncedExternalIds.add(s.id)

          let existing = await prisma.consultant.findUnique({ where: { externalStaffId: s.id } })

          // If not found by externalStaffId, try matching by name to link manual entries
          if (!existing) {
            const nameMatch = await prisma.consultant.findFirst({
              where: { name: { equals: name, mode: 'insensitive' }, branch: br, externalStaffId: null, isActive: true },
            })
            if (nameMatch) {
              await prisma.consultant.update({
                where: { id: nameMatch.id },
                data: { externalStaffId: s.id },
              })
              existing = { ...nameMatch, externalStaffId: s.id }
            }
          }

          // Always re-activate: if marketing hub returns this person, they should be active.
          // Omitting isActive here would leave previously deactivated consultants frozen as inactive.
          const syncData: Record<string, unknown> = { name, department: dept, branch: br, isActive: true }

          // Keep the branch in step with the per-branch override, and let any further
          // consultant branches ride along as extras so both branches can see them.
          if (consultantBranches.length > 0) {
            syncData.branch = consultantBranches[0]
            if (consultantBranches.length > 1) syncData.extraBranches = consultantBranches.slice(1)
          }

          // Sync contact info
          if (s.email) syncData.email = s.email
          if (s.phone) syncData.phone = s.phone
          if (s.bankName) syncData.bankName = s.bankName
          if (s.bankAccountNo) syncData.bankAccountNo = s.bankAccountNo

          // Sync Bio ID (employeeId from Marketing Hub = biometric device ID for payreg)
          if (s.employeeId) {
            const bioId = parseInt(s.employeeId)
            if (!isNaN(bioId)) syncData.bioId = bioId
          }

          // Pre-fill government IDs from HR platform if not already set
          if (s.tin && (!existing || !existing.tinNumber)) syncData.tinNumber = s.tin
          if (s.sss && (!existing || !existing.sssNumber)) syncData.sssNumber = s.sss
          if (s.philhealth && (!existing || !existing.philhealthNumber)) syncData.philhealthNumber = s.philhealth
          if (s.pagibig && (!existing || !existing.pagibigNumber)) syncData.pagibigNumber = s.pagibig

          await prisma.consultant.upsert({
            where: { externalStaffId: s.id },
            update: syncData,
            create: {
              externalStaffId: s.id, name, department: dept,
              // Pin to the branch that actually retains them as a consultant.
              branch: consultantBranches[0] || br,
              ...syncData,
            },
          })
        }

        // Phase 3: Soft-delete consultants removed from marketing hub
        // Only affect those that were previously synced (have externalStaffId)
        if (syncedExternalIds.size > 0) {
          const linkedConsultants = await prisma.consultant.findMany({
            where: { externalStaffId: { not: null }, isActive: true },
            select: { id: true, name: true, externalStaffId: true, _count: { select: { payrollEntries: true } } },
          })
          // Names the feed still carries. Someone who dropped out but whose name is still
          // listed is a merged twin — the branch profile that was absorbed when the person
          // became interbranch — not someone who left.
          const syncedNames = new Set(
            staff.map(s => formatName(`${s.firstName} ${s.lastName}`).trim().toUpperCase())
          )
          for (const c of linkedConsultants) {
            if (!c.externalStaffId || syncedExternalIds.has(c.externalStaffId)) continue
            // Resigned — either the feed says so outright, or they have now been missing from
            // it across more than one sync. Payslips are keyed to this row, not its isActive
            // flag, so everything they were ever paid stays on the books.
            if (directory.inactiveIds.has(c.externalStaffId) || directory.goneIds.has(c.externalStaffId)) {
              console.warn(`[payroll/consultants] ${c.name} has left the staff feed — deactivating `
                + `(${c._count.payrollEntries} payslip(s) kept).`)
              await prisma.consultant.update({ where: { id: c.id }, data: { isActive: false } })
              continue
            }
            // A merged twin must go even with payslips behind it, or the person is generated
            // twice at whichever branch both records reach. The payslips are keyed to the
            // Consultant row, not its isActive flag, so past payroll stays intact.
            if (syncedNames.has(c.name.trim().toUpperCase())) {
              console.warn(`[payroll/consultants] ${c.name} has a second record that is no longer in `
                + `the staff feed — deactivating it as a merged duplicate (${c._count.payrollEntries} payslip(s) kept).`)
              await prisma.consultant.update({ where: { id: c.id }, data: { isActive: false } })
              continue
            }
            // Never deactivate someone who has been paid. A rename upstream, a changed id, or
            // a source that briefly stops listing them would otherwise silently pull the
            // consultant behind locked payslips out of payroll. Absence from one sync is not
            // evidence someone has left.
            if (c._count.payrollEntries > 0) {
              console.warn(`[payroll/consultants] ${c.name} is missing from the staff feed but has `
                + `${c._count.payrollEntries} payslip(s) — left active. Deactivate manually if they have really left.`)
              continue
            }
            await prisma.consultant.update({ where: { id: c.id }, data: { isActive: false } })
          }
        }
      }
    } catch (e) {
      console.error('Consultant sync error:', e)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { isActive: true }
  if (department) where.department = department

  const allowed = allowedBranches((session.user as { role?: string }).role || '')
  if (branch && allowed && !allowed.includes(branch)) {
    return NextResponse.json({ error: 'Access denied for this branch' }, { status: 403 })
  }
  if (!branch && allowed) {
    where.OR = [{ branch: { in: allowed } }, { extraBranches: { hasSome: allowed } }]
  }

  // Interbranch consultants have a merged HR profile: one record with a primary
  // `branch` + `extraBranches`, and they may take sessions at more than one branch.
  // They must appear under EVERY branch they actually work in so a separate payslip
  // can be produced per branch. Source of truth for "works here" = orders (sessions)
  // billed at the branch, matched by clinician name — same match payroll generation uses.
  let interbranchNames = new Set<string>()
  if (branch) {
    const orderBranch = BRANCH_TO_ORDER[branch] || branch
    const orderClinicians = await prisma.order.findMany({
      where: { branch: orderBranch, status: 'COMPLETED', clinicianName: { not: null } },
      select: { clinicianName: true },
      distinct: ['clinicianName'],
    })
    interbranchNames = new Set(orderClinicians.map(o => (o.clinicianName || '').trim().toUpperCase()).filter(Boolean))
  }

  // Fetch the full active roster (dept + role scope applied), then narrow to the
  // requested branch by primary branch OR extraBranches OR having sessions there.
  const roster = await prisma.consultant.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      unitPayRates: {
        include: { unitPay: { select: { id: true, name: true } } },
      },
      benefits: { where: { isActive: true } },
    },
  })
  const consultants = branch
    ? roster.filter(c => c.branch === branch || (c.extraBranches || []).includes(branch) || interbranchNames.has(c.name.trim().toUpperCase()))
    : roster

  // Affiliated branches = primary + extraBranches + every branch they have sessions in.
  // Shown in the Branch column so interbranch consultants list all their branches, not
  // just the primary of their merged profile.
  const ORDER_TO_BRANCH: Record<string, string> = Object.fromEntries(Object.entries(BRANCH_TO_ORDER).map(([k, v]) => [v, k]))
  const sessionBranches = await prisma.order.groupBy({
    by: ['clinicianName', 'branch'],
    where: { status: 'COMPLETED', clinicianName: { not: null } },
  })
  const nameToBranches = new Map<string, Set<string>>()
  for (const g of sessionBranches) {
    const code = ORDER_TO_BRANCH[g.branch]
    if (!code) continue
    const key = (g.clinicianName || '').trim().toUpperCase()
    if (!key) continue
    if (!nameToBranches.has(key)) nameToBranches.set(key, new Set())
    nameToBranches.get(key)!.add(code)
  }
  const withAffiliations = consultants.map(c => {
    const set = new Set<string>([c.branch, ...(c.extraBranches || [])])
    for (const b of nameToBranches.get(c.name.trim().toUpperCase()) || []) set.add(b)
    return { ...c, affiliatedBranches: Array.from(set).filter(Boolean) }
  })

  return NextResponse.json(withAffiliations)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { name, department, branch, externalStaffId } = await req.json()
    if (!name?.trim() || !department || !branch) {
      return NextResponse.json({ error: 'Name, department, and branch are required' }, { status: 400 })
    }

    const consultant = await prisma.consultant.create({
      data: {
        name: name.trim(),
        department,
        branch,
        externalStaffId: externalStaffId || null,
      },
    })

    return NextResponse.json(consultant, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { id, taxDeduction, monthlyRetainer, retainerByBranch, unitPayRates, isActive, name, department, branch, birAddress } = await req.json()
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}
    if (taxDeduction !== undefined) data.taxDeduction = taxDeduction
    if (monthlyRetainer !== undefined) data.monthlyRetainer = Number(monthlyRetainer)

    // Per-branch retainer for an interbranch consultant, e.g. { SBGH: 10000 } for someone who
    // consults at both branches but is retained only at Greenhills. monthlyRetainer is kept as
    // the total so payslips, exports and the roster column stay consistent with the split.
    if (retainerByBranch !== undefined) {
      if (retainerByBranch === null) {
        data.retainerByBranch = null
      } else {
        const clean: Record<string, number> = {}
        for (const [code, amt] of Object.entries(retainerByBranch as Record<string, unknown>)) {
          if (!BRANCH_CODES.includes(code)) {
            return NextResponse.json({ error: `Unknown branch "${code}"` }, { status: 400 })
          }
          const n = Number(amt)
          if (!Number.isFinite(n) || n < 0) {
            return NextResponse.json({ error: `Retainer for ${code} must be zero or more` }, { status: 400 })
          }
          if (n > 0) clean[code] = Math.round(n * 100) / 100
        }
        const keys = Object.keys(clean)
        data.retainerByBranch = keys.length > 0 ? clean : null
        // The split is authoritative when present, so the total follows it.
        if (keys.length > 0) data.monthlyRetainer = keys.reduce((s, k) => s + clean[k], 0)
      }
    }
    if (isActive !== undefined) data.isActive = isActive
    if (name !== undefined) data.name = name.trim()
    if (department !== undefined) data.department = department
    if (branch !== undefined) data.branch = branch
    if (birAddress !== undefined) data.birAddress = birAddress || null

    const consultant = await prisma.consultant.update({ where: { id }, data })

    // Update unit pay rates if provided
    if (unitPayRates && Array.isArray(unitPayRates)) {
      // Delete existing and recreate
      await prisma.consultantUnitPay.deleteMany({ where: { consultantId: id } })
      if (unitPayRates.length > 0) {
        await prisma.consultantUnitPay.createMany({
          data: unitPayRates.map((r: { unitPayId: string; amount: number; disabled?: boolean; thresholdEnabled?: boolean; thresholdAmount?: number; reducedAmount?: number }) => ({
            consultantId: id,
            unitPayId: r.unitPayId,
            amount: Number(r.amount),
            disabled: r.disabled || false,
            thresholdEnabled: r.thresholdEnabled || false,
            thresholdAmount: r.thresholdAmount != null ? Number(r.thresholdAmount) : null,
            reducedAmount: r.reducedAmount != null ? Number(r.reducedAmount) : null,
          })),
          skipDuplicates: true,
        })
      }
    }

    // Re-fetch with rates
    const result = await prisma.consultant.findUnique({
      where: { id },
      include: {
        unitPayRates: {
          include: { unitPay: { select: { id: true, name: true } } },
        },
      },
    })

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
