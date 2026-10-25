// Attachment rules shared by the browser and the server.
//
// Deliberately free of `fs`/`path`: the chat component renders attachments and
// needs the type list and the formatters, and importing them from the module
// that writes files pulled node built-ins into the client bundle and broke the
// build. Storage lives in inquiry-upload.ts, which imports from here.

/** 25 MB. The nginx site config must allow at least this — its default is 1 MB,
 *  which silently 413s anything bigger before the request reaches us. */
export const MAX_BYTES = 25 * 1024 * 1024

/** Accepted types, with the extension to store them under.
 *
 *  Allow-list rather than block-list: this takes files from the public, and
 *  "anything except the dangerous ones" is a list nobody keeps current. Office
 *  formats are included because parents send referral letters and assessment
 *  reports as Word documents.
 */
export const ALLOWED: Record<string, string> = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'image/gif': '.gif', 'image/heic': '.heic', 'image/heif': '.heif',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm',
  'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/aac': '.aac',
  'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/webm': '.weba',
  'audio/ogg': '.ogg',
}

export const ACCEPT_ATTR = ['image/*', 'video/*', 'audio/*', '.pdf', '.doc', '.docx'].join(',')

/** Which player the chat should render. */
export function kindOf(mime: string | null | undefined): 'image' | 'video' | 'audio' | 'file' {
  if (!mime) return 'file'
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'file'
}

export function humanSize(bytes: number | null | undefined): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
