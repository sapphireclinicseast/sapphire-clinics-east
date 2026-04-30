import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'SCEI Teletherapy <noreply@do-not-reply.sapphireclinicseast.org>'

interface Attachment {
  filename: string
  content: Buffer
}

export async function sendEmail({
  to,
  cc,
  subject,
  html,
  attachments,
}: {
  to: string
  cc?: string | string[]
  subject: string
  html: string
  attachments?: Attachment[]
}) {
  const ccList = !cc ? undefined : Array.isArray(cc) ? cc : [cc]
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    cc: ccList,
    subject,
    html,
    attachments: attachments?.map((att) => ({
      filename: att.filename,
      content: att.content,
    })),
  })

  if (error) {
    console.error('Resend error:', error)
    throw new Error(`Email send failed: ${error.message}`)
  }

  return data
}
