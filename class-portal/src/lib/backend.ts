// Client-side helpers for talking to marketing.sapphireclinicseast.org's
// /api/public/class-portal/* endpoints. Token is stored in localStorage and
// sent as Bearer on each request.

const TOKEN_KEY = 'scei_class_token_v1'

/**
 * Resolve the marketing app's origin. In prod the class-portal is served
 * at class.sapphireclinicseast.org and the marketing app at
 * marketing.sapphireclinicseast.org. In dev we expect the marketing app
 * on http://localhost:3000.
 */
export function backendOrigin(): string {
  if (typeof window === 'undefined') return ''
  const host = window.location.host
  if (host.startsWith('class.')) return 'https://marketing.sapphireclinicseast.org'
  if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) return 'http://localhost:3000'
  return 'https://marketing.sapphireclinicseast.org'
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(t: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem(TOKEN_KEY, t)
}
export function clearToken() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(TOKEN_KEY)
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
