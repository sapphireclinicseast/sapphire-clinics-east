import { google } from 'googleapis'
import { prisma } from './prisma'

export async function getGmailClient() {
  // Try to find a connected Gmail account from the marketing DB
  const gmailAccount = await prisma.gmailAccount.findFirst()

  let refreshToken = gmailAccount?.refreshToken ?? process.env.GOOGLE_REFRESH_TOKEN
  if (!refreshToken) throw new Error('No Gmail account connected. Connect one in the Marketing Hub.')

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
  oauth2Client.setCredentials({ refresh_token: refreshToken })

  return {
    gmail: google.gmail({ version: 'v1', auth: oauth2Client }),
    senderEmail: gmailAccount?.email ?? 'noreply@sapphireclinicseast.org',
  }
}

export function makeEmailBody(
  to: string,
  subject: string,
  htmlBody: string,
  from: string
): string {
  const boundary = 'boundary_' + Date.now()
  const message = [
    `From: Sapphire Clinics East - Teletherapy <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    htmlBody.replace(/<[^>]*>/g, ''),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    htmlBody,
    '',
    `--${boundary}--`,
  ].join('\n')
  return Buffer.from(message).toString('base64url')
}
