// Authenticating to Google Sheets.
//
// Two credentials can get us there and the clinic's Google org makes the choice
// for us, so this accepts either rather than hard-coding one:
//
//   1. A service account key (GOOGLE_SHEETS_SA_KEY_B64) — the robot has its own
//      identity, independent of any person's account. Preferred, but the org
//      enforces iam.disableServiceAccountKeyCreation, so creating one needs that
//      constraint lifted for a few minutes.
//   2. An OAuth refresh token for a real user (GOOGLE_SHEETS_OAUTH_*) — needs no
//      policy change, but the hub then acts AS that person. If their password
//      changes or an admin revokes the grant, this stops working.
//
// Whichever is configured, the scope is spreadsheets only. Not drive: the hub is
// handed two spreadsheet ids and has no business enumerating anybody's Drive.
//
// The key is read from the environment as base64 rather than a file path. A
// deploy rsyncs the repo with --delete, so a file inside it would be wiped, and
// a JSON private key with embedded newlines does not survive a .env round trip
// intact. Base64 of the whole file is one line and survives both.

import { google } from 'googleapis'
import type { sheets_v4 } from 'googleapis'

export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'

export interface SheetsAuthProblem {
  ok: false
  /** Said plainly, because this surfaces to whoever opens the sync page. */
  error: string
}
export interface SheetsClient {
  ok: true
  sheets: sheets_v4.Sheets
  /** Which credential answered, for the status line on the settings page. */
  via: 'service-account' | 'oauth-user'
  /** The service account address, or the OAuth client id. For "share the sheet with…". */
  identity: string
}

function serviceAccountCredentials(): { client_email: string; private_key: string } | null {
  const b64 = process.env.GOOGLE_SHEETS_SA_KEY_B64?.trim()
  if (!b64) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
  } catch {
    throw new Error('GOOGLE_SHEETS_SA_KEY_B64 is set but is not base64 of a JSON key.')
  }
  const key = parsed as { client_email?: string; private_key?: string; type?: string }
  if (!key.client_email || !key.private_key) {
    throw new Error('GOOGLE_SHEETS_SA_KEY_B64 decoded, but has no client_email / private_key.')
  }
  return { client_email: key.client_email, private_key: key.private_key }
}

/**
 * An authenticated Sheets client, or a plain explanation of what is missing.
 *
 * Returns a problem rather than throwing: a missing credential is a
 * configuration state the UI should describe, not a 500. A sheet that silently
 * stops updating is the failure mode worth designing against here — front desk
 * would keep filling a board nobody reads.
 */
export function sheetsClient(): SheetsClient | SheetsAuthProblem {
  try {
    const sa = serviceAccountCredentials()
    if (sa) {
      const auth = new google.auth.JWT({
        email: sa.client_email,
        key: sa.private_key,
        scopes: [SHEETS_SCOPE],
      })
      return {
        ok: true,
        sheets: google.sheets({ version: 'v4', auth }),
        via: 'service-account',
        identity: sa.client_email,
      }
    }

    const clientId = process.env.GOOGLE_SHEETS_OAUTH_CLIENT_ID?.trim()
    const clientSecret = process.env.GOOGLE_SHEETS_OAUTH_CLIENT_SECRET?.trim()
    const refreshToken = process.env.GOOGLE_SHEETS_OAUTH_REFRESH_TOKEN?.trim()
    if (clientId && clientSecret && refreshToken) {
      const auth = new google.auth.OAuth2(clientId, clientSecret)
      auth.setCredentials({ refresh_token: refreshToken })
      return {
        ok: true,
        sheets: google.sheets({ version: 'v4', auth }),
        via: 'oauth-user',
        identity: clientId,
      }
    }

    return {
      ok: false,
      error: 'No Google credential is configured. Set GOOGLE_SHEETS_SA_KEY_B64, or the three GOOGLE_SHEETS_OAUTH_* variables.',
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * Prove the credential works AND that it can reach this spreadsheet, in one
 * call. Access is granted by sharing the sheet, which is a step done by hand in
 * a different product — so "the key is valid" and "the key can see the sheet"
 * fail separately and have completely different fixes. The messages say which.
 */
export async function checkSheetAccess(spreadsheetId: string): Promise<
  { ok: true; title: string; via: string; identity: string } | SheetsAuthProblem
> {
  const client = sheetsClient()
  if (!client.ok) return client
  try {
    const res = await client.sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'properties.title',
    })
    return {
      ok: true,
      title: res.data.properties?.title ?? '(untitled)',
      via: client.via,
      identity: client.identity,
    }
  } catch (e) {
    const err = e as { code?: number; message?: string }
    if (err.code === 403) {
      return {
        ok: false,
        error: `The credential works, but it cannot open that spreadsheet. Share the sheet with ${client.identity} as an Editor.`,
      }
    }
    if (err.code === 404) {
      return { ok: false, error: 'No spreadsheet with that id — check the id from the sheet URL.' }
    }
    return { ok: false, error: err.message ?? 'Google rejected the request.' }
  }
}
