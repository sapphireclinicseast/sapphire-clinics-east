// Thin client wrappers around /api/public/class-portal/calendar/*.

import { backendFetch, backendJson, backendOrigin, getToken } from './backend'

export type CalendarEventType = 'CLASS_CANCELLED' | 'HOLIDAY' | 'FIELD_TRIP' | 'IEP_REVIEW' | 'EVENT'

export interface CalendarEvent {
  id: string
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
  fileName: string
  mimeType: string
  uploadedBy: string
  uploadedAt: string
  size: number
}

/** Pull events in a date range. Caller supplies inclusive YYYY-MM-DD bounds. */
export async function listEvents(from: string, to: string): Promise<CalendarEvent[]> {
  const url = `/api/public/class-portal/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  const { events } = await backendJson<{ events: CalendarEvent[] }>(url)
  return events
}

export async function createEvent(input: Omit<CalendarEvent, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>): Promise<CalendarEvent> {
  const { event } = await backendJson<{ event: CalendarEvent }>('/api/public/class-portal/calendar/events', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return event
}

export async function updateEvent(id: string, patch: Partial<Omit<CalendarEvent, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>>): Promise<CalendarEvent> {
  const { event } = await backendJson<{ event: CalendarEvent }>(`/api/public/class-portal/calendar/events/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return event
}

export async function deleteEvent(id: string): Promise<void> {
  await backendJson(`/api/public/class-portal/calendar/events/${id}`, { method: 'DELETE' })
}

/** Returns null when no PDF is uploaded yet (the API responds 204). */
export async function getCalendarPdfMeta(): Promise<CalendarPdfMeta | null> {
  const res = await backendFetch('/api/public/class-portal/calendar/pdf?meta=1')
  if (res.status === 204) return null
  if (!res.ok) throw new Error(`Failed to load calendar metadata (${res.status})`)
  const { meta } = await res.json()
  return meta
}

/** Build a viewable URL for the current PDF, authenticated via a one-time blob fetch. */
export async function fetchCalendarPdfBlob(): Promise<Blob | null> {
  const res = await backendFetch('/api/public/class-portal/calendar/pdf')
  if (res.status === 204) return null
  if (!res.ok) throw new Error(`Failed to load calendar PDF (${res.status})`)
  return await res.blob()
}

export async function uploadCalendarPdf(file: File): Promise<CalendarPdfMeta> {
  const fd = new FormData()
  fd.append('file', file)
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

export async function deleteCalendarPdf(): Promise<void> {
  await backendJson('/api/public/class-portal/calendar/pdf', { method: 'DELETE' })
}

/** Human-readable label for an event type. */
export function eventTypeLabel(t: CalendarEventType): string {
  switch (t) {
    case 'CLASS_CANCELLED': return 'Classes cancelled'
    case 'HOLIDAY':         return 'Holiday'
    case 'FIELD_TRIP':      return 'Field trip'
    case 'IEP_REVIEW':      return 'IEP review'
    case 'EVENT':           return 'Event'
  }
}

/** Brand-coloured swatches for each event type. */
export function eventTypeColor(t: CalendarEventType): { bg: string; fg: string; border: string } {
  switch (t) {
    case 'CLASS_CANCELLED': return { bg: '#fee2e2', fg: '#991b1b', border: '#fca5a5' }
    case 'HOLIDAY':         return { bg: '#fef3c7', fg: '#92400e', border: '#fcd34d' }
    case 'FIELD_TRIP':      return { bg: '#dbeafe', fg: '#1e40af', border: '#93c5fd' }
    case 'IEP_REVIEW':      return { bg: '#e0e7ff', fg: '#3730a3', border: '#a5b4fc' }
    case 'EVENT':           return { bg: '#d1fae5', fg: '#065f46', border: '#86efac' }
  }
}
