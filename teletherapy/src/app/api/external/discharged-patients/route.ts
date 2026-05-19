import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const HR_API_KEY = process.env.TELETHERAPY_HR_API_KEY

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key')
  if (!HR_API_KEY || !apiKey || apiKey !== HR_API_KEY) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get all DISCHARGED patient assignments with patient + therapist info
    const assignments = await prisma.patientAssignment.findMany({
      where: { status: 'DISCHARGED' },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            patientType: true,
            branches: true,
          },
        },
        therapistAccount: {
          include: {
            staff: {
              select: {
                firstName: true,
                lastName: true,
                department: true,
                branch: true,
              },
            },
          },
        },
      },
    })

    // Deduplicate: if a patient was discharged multiple times (by different therapists),
    // use the most recent discharge record per patient
    const byPatient = new Map<string, typeof assignments[0]>()
    for (const a of assignments) {
      const existing = byPatient.get(a.patient.id)
      if (!existing || (a.dischargedAt && (!existing.dischargedAt || a.dischargedAt > existing.dischargedAt))) {
        byPatient.set(a.patient.id, a)
      }
    }

    const dischargedPatients = Array.from(byPatient.values()).map((a) => ({
      patientId: a.patient.id,
      firstName: a.patient.firstName,
      lastName: a.patient.lastName,
      patientType: a.patient.patientType,
      branches: a.patient.branches,
      dischargedAt: a.dischargedAt?.toISOString() ?? null,
      dischargeRemarks: a.dischargeRemarks ?? '',
      therapistName: `${a.therapistAccount.staff.firstName} ${a.therapistAccount.staff.lastName}`,
      therapistDepartment: a.therapistAccount.staff.department as string,
      therapistBranch: a.therapistAccount.staff.branch,
    }))

    return NextResponse.json({ ok: true, dischargedPatients })
  } catch (err) {
    console.error('[external/discharged-patients] Error:', err)
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
