import { Resend } from 'resend'

// Lazy-initialise so the build doesn't throw when RESEND_API_KEY is absent
let _resend: Resend | null = null
function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error('RESEND_API_KEY is not set')
    _resend = new Resend(key)
  }
  return _resend
}

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'SCEI Staff Portal <noreply@do-not-reply.sapphireclinicseast.org>'

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
  const { data, error } = await getResend().emails.send({
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
