import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Map of survey type → key in responsesJson that holds the "strengths" feedback
const STRENGTHS_KEYS: Record<string, string[]> = {
  HR10: ['q9'],   // Pedia Patient
  HR11: ['q13'],  // Adult Patient
  HR12: ['q10'],  // Admin / Front Desk
  HR16: ['q11'],  // Group Therapy
}

// All keys to search as fallback (in case survey type mapping changes)
const ALL_STRENGTHS_KEYS = ['q9', 'q10', 'q11', 'q13', 'strengths']

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const isAdmin = session.user.role === 'ADMIN'

  // Get all staffIds this clinician has (interbranch)
  const staffIds = isAdmin
    ? undefined // admin sees all? No — require specific staff for admin too via ?staffId
    : (session.user.branches ?? []).map((b: any) => b.staffId)

  // Optional staffId query param — for admin or branch switching
  const requestedStaffId = req.nextUrl.searchParams.get('staffId')

  const where: any = {}
  if (!isAdmin) {
    if (requestedStaffId && staffIds?.includes(requestedStaffId)) {
      where.staffId = requestedStaffId
    } else {
      where.staffId = { in: staffIds }
    }
  } else if (requestedStaffId) {
    where.staffId = requestedStaffId
  }

  try {
    // @ts-ignore — SurveyResponse model exists in marketing DB, not fully migrated
    const responses = await prisma.surveyResponse.findMany({
      where,
      select: {
        id: true,
        surveyType: true,
        respondentName: true,
        branch: true,
        responsesJson: true,
        submittedAt: true,
      },
      orderBy: { submittedAt: 'desc' },
      take: 200,
    })

    // Extract strengths from each response
    const strengths: Array<{
      id: string
      text: string
      surveyType: string
      branch: string
      submittedAt: Date
      respondent: string | null
    }> = []

    for (const r of responses) {
      const json = (r.responsesJson ?? {}) as Record<string, any>
      const relevantKeys = STRENGTHS_KEYS[r.surveyType] ?? ALL_STRENGTHS_KEYS

      for (const key of relevantKeys) {
        const value = json[key]
        if (typeof value === 'string' && value.trim().length > 3) {
          strengths.push({
            id: `${r.id}-${key}`,
            text: value.trim(),
            surveyType: r.surveyType,
            branch: r.branch,
            submittedAt: r.submittedAt,
            respondent: null, // Always anonymous for confidentiality
          })
          break // Only one strengths field per response
        }
      }
    }

    return NextResponse.json({ strengths })
  } catch (err) {
    // Table might not exist yet in teletherapy DB
    return NextResponse.json({ strengths: [], error: 'Survey data unavailable' })
  }
}
