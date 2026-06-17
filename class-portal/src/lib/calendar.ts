// Thin client wrappers around /api/public/class-portal/calendar/*.

import { backendFetch, backendJson, backendOrigin, getToken } from './backend'

export type CalendarEventType = 'CLASS_CANCELLED' | 'HOLIDAY' | 'FIELD_TRIP' | 'IEP_REVIEW' | 'EVENT'
export type CalendarBranch = 'EAST' | 'GREENHILLS'

export interface CalendarEvent {
  id: string
  branch: CalendarBranch
  date: string         // YYYY-MM-DD
  endDate: string | null
  title: string
  description: string | null
  type: CalendarEventType
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface CalendarPdfMeta {
  id: string
  branch: CalendarBranch
  fileName: string
  mimeType: string
  uploadedBy: string
  uploadedAt: string
  size: number
}

/** Pull events in a date range for a branch. STUDENT/BRANCH_ADMIN/FRONTDESK
 *  callers may pass any value — the server scopes them to their own branch. */
export async function listEvents(from: string, to: string, branch?: CalendarBranch): Promise<{ events: CalendarEvent[]; branch: CalendarBranch | null }> {
  const params = new URLSearchParams({ from, to })
  if (branch) params.set('branch', branch)
  const data = await backendJson<{ events: CalendarEvent[]; branch: CalendarBranch | null }>(`/api/public/class-portal/calendar/events?${params.toString()}`)
  return { events: data.events, branch: data.branch ?? null }
}

export async function createEvent(input: Omit<CalendarEvent, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>): Promise<CalendarEvent> {
  const { event } = await backendJson<{ event: CalendarEvent }>('/api/public/class-portal/calendar/events', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return event
}

export async function updateEvent(id: string, patch: Partial<Omit<CalendarEvent, 'id' | 'branch' | 'createdBy' | 'createdAt' | 'updatedAt'>>): Promise<CalendarEvent> {
  const { event } = await backendJson<{ event: CalendarEvent }>(`/api/public/class-portal/calendar/events/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return event
}

export async function deleteEvent(id: string): Promise<void> {
  await backendJson(`/api/public/class-portal/calendar/events/${id}`, { method: 'DELETE' })
}

/** Returns null when no PDF is uploaded yet for that branch (server: 204). */
export async function getCalendarPdfMeta(branch?: CalendarBranch): Promise<CalendarPdfMeta | null> {
  const qs = branch ? `?branch=${branch}&meta=1` : '?meta=1'
  const res = await backendFetch(`/api/public/class-portal/calendar/pdf${qs}`)
  if (res.status === 204) return null
  if (!res.ok) throw new Error(`Failed to load calendar metadata (${res.status})`)
  const { meta } = await res.json()
  return meta
}

export async function fetchCalendarPdfBlob(branch?: CalendarBranch): Promise<Blob | null> {
  const qs = branch ? `?branch=${branch}` : ''
  const res = await backendFetch(`/api/public/class-portal/calendar/pdf${qs}`)
  if (res.status === 204) return null
  if (!res.ok) throw new Error(`Failed to load calendar PDF (${res.status})`)
  return await res.blob()
}

export async function uploadCalendarPdf(file: File, branch: CalendarBranch): Promise<CalendarPdfMeta> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('branch', branch)
  const tok = getToken()
  const res = await fetch(backendOrigin() + '/api/public/class-portal/calendar/pdf', {
    method: 'POST',
    body: fd,
    headers: tok ? { authorization: `Bearer ${tok}` } : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error ?? `Upload failed (${res.status})`)
  return data.meta as CalendarPdfMeta
}

export async function deleteCalendarPdf(branch: CalendarBranch): Promise<void> {
  await backendJson(`/api/public/class-portal/calendar/pdf?branch=${branch}`, { method: 'DELETE' })
}

export function branchLabel(b: CalendarBranch): string {
  return b === 'EAST' ? 'Sapphire Clinics East' : 'Sapphire Clinics Greenhills'
}

export function branchShortLabel(b: CalendarBranch): string {
  return b === 'EAST' ? 'East' : 'Greenhills'
}

export function eventTypeLabel(t: CalendarEventType): string {
  switch (t) {
    case 'CLASS_CANCELLED': return 'Classes cancelled'
    case 'HOLIDAY':         return 'Holiday'
    case 'FIELD_TRIP':      return 'Field trip'
    case 'IEP_REVIEW':      return 'IEP review'
    case 'EVENT':           return 'Event'
  }
}

export function eventTypeColor(t: CalendarEventType): { bg: string; fg: string; border: string } {
  switch (t) {
    case 'CLASS_CANCELLED': return { bg: '#fee2e2', fg: '#991b1b', border: '#fca5a5' }
    case 'HOLIDAY':         return { bg: '#fef3c7', fg: '#92400e', border: '#fcd34d' }
    case 'FIELD_TRIP':      return { bg: '#dbeafe', fg: '#1e40af', border: '#93c5fd' }
    case 'IEP_REVIEW':      return { bg: '#e0e7ff', fg: '#3730a3', border: '#a5b4fc' }
    case 'EVENT':           return { bg: '#d1fae5', fg: '#065f46', border: '#86efac' }
  }
}
