// Shared scoping helpers for lesson routes — keeps the per-route auth
// checks consistent. A reader can see a lesson if they can see the
// parent class (teacher of record, enrolled student, scoped admin).
// A writer must be teacher of record OR admin in scope.

import { prisma } from '@/lib/prisma'

export type AuthLike = { role: string; userId?: string; branch?: string; email: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function canSeeClass(auth: AuthLike, klass: any): boolean {
  if (auth.role === 'FRONTDESK') return false
  if (auth.role === 'ADMIN') return true
  if (auth.role === 'BRANCH_ADMIN') return !auth.branch || klass.branch === auth.branch
  if (auth.role === 'TEACHER') return klass.teacherId === auth.userId
  if (auth.role === 'STUDENT') return auth.userId ? (klass.studentIds ?? []).includes(auth.userId) : false
  return false
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function canEditClass(auth: AuthLike, klass: any): boolean {
  if (auth.role === 'ADMIN') return true
  if (auth.role === 'BRANCH_ADMIN') return !auth.branch || klass.branch === auth.branch
  if (auth.role === 'TEACHER') return klass.teacherId === auth.userId
  return false
}

/**
 * Load the parent class for a lesson + return scoping flags. Throws a
 * Response on lookup failure so the route handler can pass it through.
 */
export async function classForLesson(lessonId: string): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  klass: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lesson: any
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lesson = await (prisma.classPortalLesson as any).findUnique({ where: { id: lessonId } })
  if (!lesson) {
    throw new Response(JSON.stringify({ error: 'Lesson not found.' }), { status: 404, headers: { 'content-type': 'application/json' } })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const klass = await (prisma.classPortalClass as any).findUnique({ where: { id: lesson.classId } })
  if (!klass) {
    throw new Response(JSON.stringify({ error: 'Parent class not found.' }), { status: 404, headers: { 'content-type': 'application/json' } })
  }
  return { klass, lesson }
}

const ALLOWED_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']

/** Confirm a lesson date falls on one of the parent class's scheduleDays.
 *
 * The wire format anchors calendar dates at noon UTC (see class-portal
 * createLesson/updateLesson) so the day-of-week round-trips regardless of
 * the browser or container TZ. We MUST use getUTCDay() here — getDay()
 * would shift the weekday by a day for any container not running in the
 * picker's local timezone, rejecting valid dates.
 */
export function lessonDateMatchesSchedule(lessonDate: Date, scheduleDays: string[]): boolean {
  const idx = lessonDate.getUTCDay()
  const name = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][idx]
  return ALLOWED_DAYS.includes(name) && scheduleDays.includes(name)
}
