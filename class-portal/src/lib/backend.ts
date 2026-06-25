// Client-side helpers for talking to operations.sapphireclinicseast.org's
// /api/public/class-portal/* endpoints. Token is stored in localStorage and
// sent as Bearer on each request.

const TOKEN_KEY = 'scei_class_token_v1'
// Per-tab impersonation token. Lives in sessionStorage so the admin's main
// localStorage session is preserved; closing the tab automatically ends
// the impersonation without needing a server round-trip.
const IMPERSONATION_TOKEN_KEY = 'scei_class_impersonation_token_v1'
const IMPERSONATION_META_KEY = 'scei_class_impersonation_meta_v1'

/**
 * Resolve the backend app's origin. In prod the class-portal is served at
 * class.sapphireclinicseast.org and the backend at
 * operations.sapphireclinicseast.org. The legacy marketing.* hostname
 * now 301-redirects to operations.* for every URI — and browsers refuse
 * to follow 3xx on CORS preflights, so the URL HAS to be operations.*
 * directly. In dev we expect the marketing app on http://localhost:3000.
 */
export function backendOrigin(): string {
  if (typeof window === 'undefined') return ''
  const host = window.location.host
  if (host.startsWith('class.')) return 'https://operations.sapphireclinicseast.org'
  if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) return 'http://localhost:3000'
  return 'https://operations.sapphireclinicseast.org'
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  // Impersonation token wins so the admin's actions during a "View as"
  // session hit the API as the target user, not the admin.
  return sessionStorage.getItem(IMPERSONATION_TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY)
}
export function setToken(t: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem(TOKEN_KEY, t)
}
export function clearToken() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(TOKEN_KEY)
}

export interface ImpersonationMeta {
  logId: string
  targetEmail: string
  targetRole: string
  targetFirstName?: string | null
  targetLastName?: string | null
  startedAt: string
}

/** Save an impersonation token + meta to per-tab storage. */
export function setImpersonationToken(token: string, meta: ImpersonationMeta) {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(IMPERSONATION_TOKEN_KEY, token)
  sessionStorage.setItem(IMPERSONATION_META_KEY, JSON.stringify(meta))
}

export function getImpersonationMeta(): ImpersonationMeta | null {
  if (typeof window === 'undefined') return null
  const raw = sessionStorage.getItem(IMPERSONATION_META_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as ImpersonationMeta } catch { return null }
}

/** Clear the impersonation token (admin clicked "Return to admin"). */
export function clearImpersonationToken() {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(IMPERSONATION_TOKEN_KEY)
  sessionStorage.removeItem(IMPERSONATION_META_KEY)
}

export function isImpersonating(): boolean {
  if (typeof window === 'undefined') return false
  return !!sessionStorage.getItem(IMPERSONATION_TOKEN_KEY)
}

export async function backendFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = backendOrigin() + path
  const headers = new Headers(init.headers)
  if (!headers.has('content-type') && init.body) headers.set('content-type', 'application/json')
  const tok = getToken()
  if (tok) headers.set('authorization', `Bearer ${tok}`)
  return fetch(url, { ...init, headers })
}

export async function backendJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await backendFetch(path, init)
  let body: unknown
  try { body = await res.json() } catch { body = null }
  if (!res.ok) {
    const msg = (body as { error?: string } | null)?.error || `Request failed (${res.status})`
    throw new Error(msg)
  }
  return body as T
}
