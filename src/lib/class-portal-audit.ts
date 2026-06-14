// Defensive audit logger for the class-portal enrollment funnel.
//
// Insert a row in ClassPortalEnrollmentAudit for each server-visible
// event in upload-tokens / document-blobs / users-POST so we can trace
// "the parent says they uploaded but there's no record" cases by
// looking at what hit the server and where it stopped.
//
// Best-effort: every write is wrapped in a try/catch and any failure
// is silently swallowed. Audit must never break the user-facing flow.

import { prisma } from '@/lib/prisma'

export type AuditKind =
  | 'upload_token_init'
  | 'upload_token_complete'
  | 'upload_blob'
  | 'account_create_attempt'
  | 'account_create_success'
  | 'account_create_failure'

export interface AuditArgs {
  kind: AuditKind
  /** Email at the moment of the event. Lowercased before write. */
  email?: string | null
  /** Class-portal student id or upload-flow `draft_xxx` id. */
  studentId?: string | null
  /** e.g. psa_birth_cert, school_id, form_137_sf10. */
  docKey?: string | null
  /** 'ok' for success, 'error' for any thrown / rejected path. */
  outcome: 'ok' | 'error'
  /** Human-readable error message at the call site. */
  error?: string | null
  /** The incoming Request, used to extract IP + UA. */
  req?: Request
  /** Free-form bag for per-event extras: file size, role, validation
   *  failure name, etc. Keep keys short and predictable so future
   *  queries are easy. */
  metadata?: Record<string, unknown> | null
}

function clientIp(req?: Request): string | null {
  if (!req) return null
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return req.headers.get('x-real-ip') || null
}

/**
 * Insert one audit row. Never throws; failures are logged to stderr
 * but don't surface to the caller.
 */
export async function auditEnrollment(args: AuditArgs): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).classPortalEnrollmentAudit.create({
      data: {
        kind: args.kind,
        email: args.email ? args.email.trim().toLowerCase() : null,
        studentId: args.studentId ?? null,
        docKey: args.docKey ?? null,
        outcome: args.outcome,
        // Trim long errors so a stack trace doesn't blow the row size.
        error: args.error ? args.error.slice(0, 2000) : null,
        ip: clientIp(args.req),
        userAgent: args.req?.headers.get('user-agent')?.slice(0, 500) ?? null,
        metadata: args.metadata ?? undefined,
      },
    })
  } catch (e) {
    console.warn('[auditEnrollment] insert failed (swallowed):', (e as Error).message)
  }
}
