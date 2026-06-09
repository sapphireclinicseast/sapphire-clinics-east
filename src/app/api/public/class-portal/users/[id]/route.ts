// PATCH  /api/public/class-portal/users/[id]    — admin: edit any field; student: edit their own enrollment (+ profile fields)
// DELETE /api/public/class-portal/users/[id]    — admin only

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, hashPassword } from '@/lib/class-portal-auth'
import { syncStudentToPatientCrm } from '@/lib/class-portal-patient-sync'
import { withCors, corsHeaders } from '../../../_cors'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

async function asJsonError(origin: string | null, e: unknown): Promise<NextResponse> {
  if (e instanceof Response) {
    const headers = new Headers(e.headers)
    for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
    return new NextResponse(e.body, { status: e.status, headers })
  }
  return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { id } = await params
    const body = await req.json() as {
      email?: string
      password?: string
      firstName?: string | null
      lastName?: string | null
      level?: string | null
      branch?: 'EAST' | 'GREENHILLS' | null
      enrollment?: Record<string, unknown> | null
      /**
       * Soft-disable flag. `true` writes disabledAt = now() + disabledBy =
       * auth.email; `false` clears both. Only the main admin may set
       * this; branch admins are blocked at the role check below.
       */
      disabled?: boolean
    }

    // STUDENT may only update their own row; BRANCH_ADMIN can edit anything
    // in their branch; ADMIN unrestricted. TEACHER + FRONTDESK can edit a
    // student's enrollment but ONLY a tight whitelist of fields (LRN +
    // LSEN classification, plus the Form 137/SF10 and School ID document
    // metadata entries). The diff check at the end of this block enforces
    // the whitelist by comparing the incoming payload to the existing row.
    if (auth.role === 'STUDENT' && auth.userId !== id) {
      return withCors(NextResponse.json({ error: 'You can only edit your own record.' }, { status: 403 }), origin)
    }
    if (auth.role === 'BRANCH_ADMIN') {
      const target = await prisma.classPortalUser.findUnique({ where: { id } })
      if (!target) {
        return withCors(NextResponse.json({ error: 'User not found.' }, { status: 404 }), origin)
      }
      if (target.role === 'BRANCH_ADMIN' && target.id !== auth.userId) {
        return withCors(NextResponse.json({ error: 'Branch admins cannot edit other branch admins.' }, { status: 403 }), origin)
      }
      // Branch admins may only touch users in their branch (or unscoped teachers).
      if (target.branch && auth.branch && target.branch !== auth.branch) {
        return withCors(NextResponse.json({ error: 'Out of branch scope.' }, { status: 403 }), origin)
      }
    }
    if (auth.role === 'TEACHER' || auth.role === 'FRONTDESK') {
      const target = await prisma.classPortalUser.findUnique({ where: { id } })
      if (!target) {
        return withCors(NextResponse.json({ error: 'User not found.' }, { status: 404 }), origin)
      }
      if (target.role !== 'STUDENT') {
        return withCors(NextResponse.json({ error: 'This role can only edit student records.' }, { status: 403 }), origin)
      }
      // FRONTDESK is also branch-scoped when their token carries a branch.
      if (auth.role === 'FRONTDESK' && auth.branch && target.branch && target.branch !== auth.branch) {
        return withCors(NextResponse.json({ error: 'Out of branch scope.' }, { status: 403 }), origin)
      }
      // Block the categorically-off-limits operations up front so the
      // error message is specific instead of "field N changed".
      if (body.password !== undefined && body.password) {
        return withCors(NextResponse.json({ error: 'This role cannot reset passwords. Ask the main admin.' }, { status: 403 }), origin)
      }
      if (body.disabled !== undefined) {
        return withCors(NextResponse.json({ error: 'This role cannot disable accounts.' }, { status: 403 }), origin)
      }
      // Reject identity-field changes by comparing against the stored row.
      // Sending the same value is fine (the client's updateUserEnrollment
      // helper always sends every identity field for round-trip safety),
      // so we compare instead of rejecting on presence.
      const normEmail = (v: unknown) => typeof v === 'string' ? v.trim().toLowerCase() : v
      if (body.email !== undefined && normEmail(body.email) !== target.email) {
        return withCors(NextResponse.json({ error: 'This role cannot change the email.' }, { status: 403 }), origin)
      }
      if (body.firstName !== undefined && (body.firstName ?? null) !== (target.firstName ?? null)) {
        return withCors(NextResponse.json({ error: 'This role cannot change the first name.' }, { status: 403 }), origin)
      }
      if (body.lastName !== undefined && (body.lastName ?? null) !== (target.lastName ?? null)) {
        return withCors(NextResponse.json({ error: 'This role cannot change the last name.' }, { status: 403 }), origin)
      }
      if (body.level !== undefined && (body.level ?? null) !== (target.level ?? null)) {
        return withCors(NextResponse.json({ error: 'This role cannot change the grade level.' }, { status: 403 }), origin)
      }
      if (body.branch !== undefined && (body.branch ?? null) !== (target.branch ?? null)) {
        return withCors(NextResponse.json({ error: 'This role cannot change the branch.' }, { status: 403 }), origin)
      }
      // Enrollment field-level diff: walk the incoming enrollment vs.
      // the stored one. Any key whose JSON-serialised value differs and
      // ISN'T in ALLOWED_ENROLLMENT_KEYS is rejected. `documents` gets
      // a sub-key whitelist of just form_137_sf10 + school_id.
      if (body.enrollment !== undefined && body.enrollment !== null) {
        const existing = (target.enrollment ?? {}) as Record<string, unknown>
        const incoming = body.enrollment as Record<string, unknown>
        const ALLOWED_ENROLLMENT_KEYS = new Set(['lrn', 'lrnStatus', 'lsenClassification', 'documents'])
        const ALLOWED_DOC_KEYS = new Set(['form_137_sf10', 'school_id'])
        const allKeys = new Set([...Object.keys(existing), ...Object.keys(incoming)])
        for (const k of allKeys) {
          if (JSON.stringify(existing[k]) === JSON.stringify(incoming[k])) continue
          if (!ALLOWED_ENROLLMENT_KEYS.has(k)) {
            return withCors(NextResponse.json({ error: `This role cannot change enrollment.${k}.` }, { status: 403 }), origin)
          }
          if (k === 'documents') {
            const beforeDocs = (existing.documents ?? {}) as Record<string, unknown>
            const afterDocs = (incoming.documents ?? {}) as Record<string, unknown>
            const docKeys = new Set([...Object.keys(beforeDocs), ...Object.keys(afterDocs)])
            for (const dk of docKeys) {
              if (JSON.stringify(beforeDocs[dk]) === JSON.stringify(afterDocs[dk])) continue
              if (!ALLOWED_DOC_KEYS.has(dk)) {
                return withCors(NextResponse.json({ error: `This role can only upload Form 137/SF10 and School ID. Asked to change documents.${dk}.` }, { status: 403 }), origin)
              }
            }
          }
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = { updatedAt: new Date() }
    if (body.email !== undefined) data.email = String(body.email).trim().toLowerCase()
    if (body.password !== undefined && body.password) {
      data.passwordHash = await hashPassword(body.password)
      // Audit who set the password and when — plaintext is NOT stored.
      data.passwordSetAt = new Date()
      data.passwordSetBy = auth.email
    }
    if (body.firstName !== undefined) data.firstName = body.firstName
    if (body.lastName !== undefined) data.lastName = body.lastName
    if (body.level !== undefined) data.level = body.level
    if (body.branch !== undefined) data.branch = body.branch
    if (body.enrollment !== undefined) data.enrollment = body.enrollment
    // Disable / enable. Restricted to main admin: branch admins can
    // already edit users in their branch but should NOT be able to
    // lock other staff out. STUDENT self-edits never carry `disabled`.
    if (body.disabled !== undefined) {
      if (auth.role !== 'ADMIN') {
        return withCors(NextResponse.json({ error: 'Only the main admin can disable or re-enable accounts.' }, { status: 403 }), origin)
      }
      data.disabledAt = body.disabled ? new Date() : null
      data.disabledBy = body.disabled ? auth.email : null
    }

    const updated = await prisma.classPortalUser.update({ where: { id }, data })

    // Keep the marketing Patient CRM in sync — same identity (matched by
    // email), updated fields propagate so the CRM always reflects the
    // latest enrollment data without staff having to re-enter anything.
    if (updated.role === 'STUDENT') {
      try {
        await syncStudentToPatientCrm({
          email: updated.email,
          firstName: updated.firstName,
          lastName: updated.lastName,
          branch: updated.branch as 'EAST' | 'GREENHILLS' | null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          enrollment: (updated.enrollment as any) ?? null,
        })
      } catch (e) {
        console.warn('[users.PATCH] Patient CRM sync failed (non-fatal):', e)
      }
    }

    return withCors(NextResponse.json({
      user: {
        id: updated.id,
        role: updated.role,
        email: updated.email,
        firstName: updated.firstName,
        lastName: updated.lastName,
        level: updated.level,
        branch: updated.branch,
        enrollment: updated.enrollment,
        passwordSetAt: updated.passwordSetAt ? updated.passwordSetAt.toISOString() : null,
        passwordSetBy: updated.passwordSetBy ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        disabledAt: (updated as any).disabledAt ? (updated as any).disabledAt.toISOString() : null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        disabledBy: (updated as any).disabledBy ?? null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    }), origin)
  } catch (e) {
    return asJsonError(origin, e)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    await requireAuth(req, ['ADMIN'])
    const { id } = await params
    await prisma.classPortalUser.delete({ where: { id } })
    return withCors(NextResponse.json({ ok: true }), origin)
  } catch (e) {
    return asJsonError(origin, e)
  }
}
