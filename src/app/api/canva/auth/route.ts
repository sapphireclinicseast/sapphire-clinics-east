import { NextResponse } from 'next/server'
import { generateCodeVerifier, generateCodeChallenge, getAuthorizationUrl } from '@/lib/canva'
import { cookies } from 'next/headers'

export async function GET() {
  const clientId = process.env.CANVA_CLIENT_ID
  if (!clientId) {
    return NextResponse.json(
      { error: 'CANVA_CLIENT_ID is not configured. Add it to your .env.production file.' },
      { status: 500 }
    )
  }

  const redirectUri = `${process.env.NEXTAUTH_URL}/api/canva/callback`
  const state = crypto.randomUUID()
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)

  // Store verifier + state in cookies (30 min expiry)
  // secure:true required in HTTPS production so the cookie is sent back after Canva redirect
  // sameSite:'lax' allows the cookie to be sent on top-level navigation (OAuth callback)
  const isProduction = process.env.NODE_ENV === 'production'
  const cookieStore = await cookies()
  cookieStore.set('canva_code_verifier', codeVerifier, { httpOnly: true, maxAge: 1800, path: '/', secure: isProduction, sameSite: 'lax' })
  cookieStore.set('canva_state', state, { httpOnly: true, maxAge: 1800, path: '/', secure: isProduction, sameSite: 'lax' })

  const authUrl = getAuthorizationUrl(clientId, redirectUri, codeChallenge, state)
  return NextResponse.redirect(authUrl)
}
