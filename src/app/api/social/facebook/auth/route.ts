import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { cookies } from 'next/headers'

const SCOPES = [
  'pages_show_list',
  'pages_manage_posts',
  'pages_read_engagement',
  'instagram_basic',
  'instagram_content_publish',
  'business_management',
].join(',')

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appId = process.env.META_APP_ID
  if (!appId) return NextResponse.json({ error: 'META_APP_ID not configured' }, { status: 500 })

  const baseUrl = process.env.NEXTAUTH_URL || 'https://operations.sapphireclinicseast.org'
  const redirectUri = `${baseUrl}/api/social/facebook/callback`
  const state = crypto.randomUUID()

  // Store state in cookie to prevent CSRF
  const cookieStore = await cookies()
  cookieStore.set('fb_oauth_state', state, { httpOnly: true, maxAge: 600, path: '/' })

  const authUrl = new URL('https://www.facebook.com/v19.0/dialog/oauth')
  authUrl.searchParams.set('client_id', appId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('scope', SCOPES)
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('response_type', 'code')

  return NextResponse.redirect(authUrl.toString())
}
