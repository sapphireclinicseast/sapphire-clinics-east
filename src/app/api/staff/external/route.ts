/**
 * External Staff API — Bearer token auth
 *
 * Used by Accounting Hub POS to search clinicians/therapists.
 * Also fetches gov IDs from HR platform for employee sync.
 * Env: EXTERNAL_API_KEY — shared secret token
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const API_KEY = process.env.EXTERNAL_API_KEY
// Try configured URL first, then common Docker host addresses for Linux
const HR_URLS = [
  process.env.HR_PLATFORM_URL,
  'http://172.17.0.1:3457',   // default Docker bridge gateway
  'http://172.18.0.1:3457',   // compose network gateway
  'http://host.docker.internal:3457',
  'http://127.0.0.1:3457',    // localhost (works if not in Docker)
].filter(Boolean) as string[]
const HR_KEY = process.env.HR_PLATFORM_API_KEY || process.env.EXTERNAL_API_KEY || ''

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!API_KEY || !authHeader || authHeader !== `Bearer ${API_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search')?.trim()
  const branch = searchParams.get('branch')?.toUpperCase()
  const includeHR = searchParams.get('includeHR') === 'true'
  // Deactivated profiles are excluded by default. Merging an interbranch person leaves the
  // absorbed branch profile behind as active:false; emitting it kept Payroll syncing a second
  // Consultant record for the same human, which then produced two payslips at one branch.
  const includeInactive = searchParams.get('includeInactive') === 'true'

  try {
    const staff = await prisma.staff.findMany({
      where: {
        AND: [
          includeInactive ? {} : { active: true },
          // A branch filter must also match interbranch staff: someone whose
          // primary branch is SBGH but who also works at SBEA (extraBranches)
          // belongs in SBEA's clinician list too — e.g. the POS Edit Order
          // clinician search.
          branch ? { OR: [{ branch }, { extraBranches: { has: branch } }] } : {},
          search
            ? {
                OR: [
                  { firstName: { contains: search, mode: 'insensitive' } },
                  { lastName: { contains: search, mode: 'insensitive' } },
                ],
              }
            : {},
        ],
      },
      select: {
        id: true,
        employeeId: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        department: true,
        branch: true,
        branchEmployment: true,
        jobTitle: true,
        employmentType: true,
        // Whether they are still with us. Emitted always — a consumer asking for inactive
        // staff needs to tell which ones they are, and one asking only for current staff
        // can now record the answer rather than inferring it from an absence.
        active: true,
        // Per-branch role + the other branches they work at, so Payroll can place the
        // same person as an employee at one branch and a consultant at another.
        employmentByBranch: true,
        extraBranches: true,
        hrPlatformId: true,
        // Mentorship / supervision roles for payroll: Clinical Supervisor,
        // Clinical Mentor, and (via menteeIds, below) who is a mentee.
        isInternshipSupervisor: true,
        isClinicalMentor: true,
        menteeIds: true,
        sss: true,
        philhealth: true,
        pagibig: true,
        tin: true,
        bankName: true,
        bankAccountNo: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      ...(search ? { take: 20 } : {}),
    })

    // Per-branch roles are carried on the record itself (employmentByBranch), NOT by emitting
    // a second row per branch. A synthetic "staffId:branch" id would land in
    // Consultant.externalStaffId and orphan the real record — whose id is the plain staffId —
    // so the consultant sync's purge step would deactivate consultants that hold locked
    // payslips. One row per person; the payroll syncs read employmentByBranch to decide which
    // tab and which branch they belong to.
    type StaffRow = (typeof staff)[0] & { id: string; branch: string }
    const extraRows: StaffRow[] = []

    // A mentee is anyone listed in some mentor's menteeIds. Query ALL mentors
    // (not just the filtered result) so a branch- or search-filtered request
    // still classifies its rows correctly.
    const allMentors = await prisma.staff.findMany({
      where: { isClinicalMentor: true },
      select: { menteeIds: true },
    })
    const menteeIdSet = new Set(allMentors.flatMap(m => m.menteeIds))
    for (const s0 of staff as (StaffRow & { isMentee?: boolean; isClinicalSupervisor?: boolean })[]) {
      s0.isMentee = menteeIdSet.has(s0.id)
      // Emit under the name payroll uses; the raw flag rides along too.
      s0.isClinicalSupervisor = (s0 as { isInternshipSupervisor?: boolean }).isInternshipSupervisor ?? false
    }

    // If includeHR is requested, fetch gov IDs from HR platform
    // Try multiple URLs to handle Docker networking on Linux
    if (includeHR && HR_KEY) {
      for (const hrUrl of HR_URLS) {
        try {
          const hrRes = await fetch(`${hrUrl}/staff/external`, {
            headers: { Authorization: `Bearer ${HR_KEY}` },
            cache: 'no-store',
            signal: AbortSignal.timeout(5000), // 5s timeout per attempt
          })
          if (hrRes.ok) {
            const hrData = await hrRes.json()
            const hrStaff = hrData.staff || []
            // Build lookup by firstName+lastName
            const hrByName = new Map<string, Record<string, unknown>>()
            for (const h of hrStaff) {
              const key = `${String(h.firstName || '').toUpperCase()}|${String(h.lastName || '').toUpperCase()}`
              hrByName.set(key, h)
            }
            // Merge HR data into staff results
            const enriched = [...staff, ...extraRows].map(s => {
              const key = `${s.firstName.toUpperCase()}|${s.lastName.toUpperCase()}`
              const hr = hrByName.get(key)
              return {
                ...s,
                sss: hr?.sss || null,
                philhealth: hr?.philhealth || null,
                pagibig: hr?.pagibig || null,
                tin: hr?.tin || null,
                // HR platform is authoritative for bank details; fall back to Staff table values
                bankName: (hr?.bankName as string) || s.bankName || null,
                bankAccountNo: (hr?.bankAccountNo as string) || s.bankAccountNo || null,
                hrJobTitle: hr?.jobTitle || null,
                hrEmployeeId: hr?.employeeId || null,
              }
            })
            console.log(`[external-staff] HR fetch OK via ${hrUrl}, enriched ${enriched.length} staff (${extraRows.length} extra branch rows)`)
            return NextResponse.json({ staff: enriched })
          }
        } catch (hrErr) {
          console.error(`[external-staff] HR fetch failed via ${hrUrl}:`, hrErr instanceof Error ? hrErr.message : hrErr)
          continue // try next URL
        }
      }
      console.error('[external-staff] All HR URLs failed — returning staff without HR data')
    }

    return NextResponse.json({ staff: [...staff, ...extraRows] })
  } catch (err) {
    console.error('[external-staff] Query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
