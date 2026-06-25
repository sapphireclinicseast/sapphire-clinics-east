import { readFile } from 'fs/promises'
import path from 'path'

// Aura Health Rehab brand palette (also used inline across email templates):
//   #244952 deep teal · #4a8073 teal · #edf3d9 pale green
//   #cf9d88 clay · #c69849 gold
//
// The cream/light logo variant is used because patient-facing emails lead with
// a dark teal gradient header — the colored logo would have no contrast there.

const LOGO_PATH = path.join(process.cwd(), 'public', 'email', 'aura-logo-cream.png')
export const EMAIL_LOGO_CID = 'auralogo'

export interface EmailLogo {
  cid: string
  filename: string
  content: Buffer
}

/**
 * Read the cream Aura logo for inline (cid) embedding. Returns null if the file
 * is missing so a send can still proceed without the logo rather than throwing.
 */
export async function loadEmailLogo(): Promise<EmailLogo | null> {
  try {
    const content = await readFile(LOGO_PATH)
    return { cid: EMAIL_LOGO_CID, filename: 'aura-logo-cream.png', content }
  } catch {
    return null
  }
}

/**
 * Branded dark-teal header shared by patient-facing emails. When `hasLogo` is
 * true the inline logo is rendered (caller must also pass the logo via
 * sendEmail's `inlineImages`); otherwise the header degrades to text only.
 */
export function emailHeader(title: string, subtitle: string, hasLogo: boolean): string {
  return `
    <div style="background: linear-gradient(135deg, #244952, #4a8073); padding: 28px 24px; border-radius: 12px 12px 0 0; text-align: center;">
      ${hasLogo ? `<img src="cid:${EMAIL_LOGO_CID}" alt="Aura Health Rehab" width="132" style="display:block; margin:0 auto 14px; width:132px; max-width:60%; height:auto; border:0;" />` : ''}
      <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; font-family: 'Montserrat','Arimo',Verdana,sans-serif;">${title}</h1>
      ${subtitle ? `<p style="color: rgba(255,255,255,0.75); margin: 6px 0 0; font-size: 13px;">${subtitle}</p>` : ''}
    </div>`
}
