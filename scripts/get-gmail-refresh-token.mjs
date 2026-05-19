#!/usr/bin/env node
// One-shot helper: run on your laptop, sign in as the Google account you want
// to send mail as, and copy the printed refresh_token into the deployment env.
//
// Usage:
//   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/get-gmail-refresh-token.mjs
//
// Optional env:
//   PORT=8080                 # local callback port (default 8080)
//   SCOPE="https://www.googleapis.com/auth/gmail.send"   # space-separated scopes
//
// Prereq (one-time): in Google Cloud Console → APIs & Services → Credentials,
// add  http://localhost:<PORT>/callback  to "Authorized redirect URIs" for
// your OAuth 2.0 Client. Remove it after you're done.

import http from 'node:http'
import { spawn } from 'node:child_process'
import { URL } from 'node:url'

const clientId = process.env.GOOGLE_CLIENT_ID
const clientSecret = process.env.GOOGLE_CLIENT_SECRET
const port = Number(process.env.PORT ?? 8080)
const scope = process.env.SCOPE ?? 'https://www.googleapis.com/auth/gmail.send'

if (!clientId || !clientSecret) {
  console.error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in env.')
  process.exit(1)
}

const redirectUri = `http://localhost:${port}/callback`

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
authUrl.searchParams.set('client_id', clientId)
authUrl.searchParams.set('redirect_uri', redirectUri)
authUrl.searchParams.set('response_type', 'code')
authUrl.searchParams.set('scope', scope)
authUrl.searchParams.set('access_type', 'offline')
authUrl.searchParams.set('prompt', 'consent')

function openBrowser(url) {
  const cmd =
    process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'cmd'
    : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref()
  } catch {
    // ignore — user can open the URL manually
  }
}

async function exchangeCode(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token exchange failed (${res.status}): ${text}`)
  }
  return res.json()
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`)
  if (url.pathname !== '/callback') {
    res.writeHead(404).end()
    return
  }

  const err = url.searchParams.get('error')
  const code = url.searchParams.get('code')

  if (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain' })
    res.end(`OAuth error: ${err}\nYou can close this tab.`)
    console.error(`\n✗ OAuth error: ${err}`)
    server.close()
    process.exit(1)
  }

  if (!code) {
    res.writeHead(400).end('No code in callback.')
    return
  }

  try {
    const tokens = await exchangeCode(code)
    if (!tokens.refresh_token) {
      const msg =
        'Google did NOT return a refresh_token. This usually means this OAuth client + Google account combination has been authorized before.\n' +
        'Fix: visit https://myaccount.google.com/permissions while signed in as the SAME account, revoke this OAuth client, then re-run.'
      res.writeHead(400, { 'Content-Type': 'text/plain' })
      res.end(msg + '\nYou can close this tab.')
      console.error(`\n✗ ${msg}`)
      server.close()
      process.exit(1)
    }

    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end('<h1>✓ Got it</h1><p>Refresh token printed in the terminal. You can close this tab.</p>')

    console.log('\n────────────────────────────────────────────────')
    console.log('Refresh token (copy this into the VPS env file):')
    console.log('────────────────────────────────────────────────')
    console.log(tokens.refresh_token)
    console.log('────────────────────────────────────────────────')
    console.log('Add to /opt/sapphire/docker/.env.production:')
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`)
    console.log()

    server.close()
    process.exit(0)
  } catch (e) {
    res.writeHead(500).end(String(e?.message ?? e))
    console.error(`\n✗ ${e?.message ?? e}`)
    server.close()
    process.exit(1)
  }
})

server.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`)
  console.log('Opening browser… sign in as the account you want to send mail as.')
  console.log('(If the browser does not open, copy this URL manually:)\n')
  console.log(authUrl.toString())
  console.log()
  openBrowser(authUrl.toString())
})
