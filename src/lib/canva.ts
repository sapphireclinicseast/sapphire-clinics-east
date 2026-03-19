// ============================================================
// Canva Connect API utilities
// ============================================================

const CANVA_API_BASE = 'https://api.canva.com/rest/v1'
const CANVA_AUTH_URL = 'https://www.canva.com/api/oauth/authorize'
const CANVA_TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token'

export const CANVA_SCOPES = [
  'design:meta:read',
  'design:content:read',
  'asset:read',
  'profile:read',
].join(' ')

// ── PKCE helpers ─────────────────────────────────────────────

function base64urlEncode(buffer: Uint8Array): string {
  const bytes = Array.from(buffer)
  const binary = bytes.map((b) => String.fromCharCode(b)).join('')
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

export function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(array)
  } else {
    // Node.js fallback
    const { randomBytes } = require('crypto')
    const bytes = randomBytes(32)
    bytes.copy(Buffer.from(array.buffer))
  }
  return base64urlEncode(array)
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data)
  return base64urlEncode(new Uint8Array(digest))
}

// ── OAuth URLs ────────────────────────────────────────────────

export function getAuthorizationUrl(
  clientId: string,
  redirectUri: string,
  codeChallenge: string,
  state: string
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: CANVA_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })
  return `${CANVA_AUTH_URL}?${params}`
}

// ── Token exchange ────────────────────────────────────────────

export async function exchangeCodeForToken(
  clientId: string,
  clientSecret: string,
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<{
  access_token: string
  refresh_token?: string
  expires_in: number
}> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  })

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch(CANVA_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Canva token exchange failed: ${err}`)
  }

  return res.json()
}

export async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch(CANVA_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  if (!res.ok) throw new Error('Token refresh failed')
  return res.json()
}

// ── API calls ─────────────────────────────────────────────────

export async function listDesigns(
  accessToken: string,
  query?: string,
  continuation?: string
): Promise<{
  items: CanvaDesign[]
  continuation?: string
}> {
  const params = new URLSearchParams({
    ownership: 'owned',
    page_size: '40',
  })
  if (query) params.set('query', query)
  if (continuation) params.set('continuation', continuation)

  const res = await fetch(`${CANVA_API_BASE}/designs?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (res.status === 401) throw new Error('UNAUTHORIZED')
  if (!res.ok) throw new Error(`Canva designs fetch failed: ${res.status}`)

  const data = await res.json()
  return {
    items: data.items || [],
    continuation: data.continuation,
  }
}

export async function exportDesign(
  accessToken: string,
  designId: string
): Promise<string[]> {
  // Create export job
  const res = await fetch(`${CANVA_API_BASE}/exports`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      design_id: designId,
      format: { type: 'jpg', quality: 90 },
    }),
  })

  if (!res.ok) throw new Error(`Export request failed: ${res.status}`)
  const data = await res.json()
  const jobId: string = data.job?.id

  if (!jobId) throw new Error('No export job ID returned')

  // Poll until complete (max 30s)
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 2000))

    const pollRes = await fetch(`${CANVA_API_BASE}/exports/${jobId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const pollData = await pollRes.json()
    const job = pollData.job

    if (job?.status === 'success' && job.urls?.length > 0) {
      return job.urls as string[]
    }
    if (job?.status === 'failed') {
      throw new Error('Canva export job failed')
    }
  }

  throw new Error('Export timed out')
}

// ── Shared token helper ───────────────────────────────────────
// All Canva API routes must use this instead of rolling their own refresh logic.
// Handles:
//  - Proactive refresh when token is within 5 min of expiry
//  - Race condition: if two requests try to refresh simultaneously, the second
//    one will re-read the DB and use the token the first one already saved

import { prisma } from '@/lib/prisma'

export async function getValidCanvaToken(): Promise<string | null> {
  const account = await prisma.canvaAccount.findFirst()
  if (!account) return null

  const clientId = process.env.CANVA_CLIENT_ID
  const clientSecret = process.env.CANVA_CLIENT_SECRET
  if (!clientId || !clientSecret) return account.accessToken

  // Token still valid (>5 min remaining)
  if (account.expiresAt) {
    const msLeft = account.expiresAt.getTime() - Date.now()
    if (msLeft > 5 * 60 * 1000) return account.accessToken
  } else {
    // No expiry stored — assume valid
    return account.accessToken
  }

  // Token is expired or near expiry
  if (!account.refreshToken) return null

  try {
    const refreshed = await refreshAccessToken(clientId, clientSecret, account.refreshToken)
    const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000)
    await prisma.canvaAccount.update({
      where: { id: account.id },
      data: {
        accessToken: refreshed.access_token,
        expiresAt,
        ...(refreshed.refresh_token ? { refreshToken: refreshed.refresh_token } : {}),
      },
    })
    return refreshed.access_token
  } catch {
    // Refresh failed — race condition check: another request may have already
    // refreshed the token and saved a different one to the DB
    const fresh = await prisma.canvaAccount.findFirst()
    if (fresh && fresh.accessToken !== account.accessToken) {
      return fresh.accessToken
    }
    return null
  }
}

// ── Types ─────────────────────────────────────────────────────

export interface CanvaDesign {
  id: string
  title: string
  thumbnail?: {
    url: string
    width: number
    height: number
  }
  urls?: {
    edit_url: string
    view_url: string
  }
  created_at: number
  updated_at: number
}
