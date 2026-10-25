// Writing enquiry attachments to disk. Server only — see attachment-types.ts
// for the rules the browser also needs.

import path from 'path'
import fs from 'fs/promises'
import { randomBytes } from 'crypto'
import { MAX_BYTES, ALLOWED } from '@/lib/attachment-types'

export interface StoredFile {
  fileUrl: string
  fileName: string
  fileMime: string
  fileSize: number
}

export interface UploadProblem { error: string; status: number }

/**
 * Validate and write an uploaded file, returning what to store on the message.
 *
 * The stored filename is random, never the user's. A name arriving from the
 * public is attacker-controlled: it can carry path separators, overwrite an
 * existing file, or end in an extension that does not match its contents. The
 * original is kept only as a label on the message row.
 */
export async function storeInquiryFile(file: File): Promise<StoredFile | UploadProblem> {
  if (!file || file.size === 0) return { error: 'The file is empty.', status: 400 }
  if (file.size > MAX_BYTES) {
    return { error: `That file is too large. The limit is ${Math.round(MAX_BYTES / 1024 / 1024)} MB.`, status: 413 }
  }
  const mime = file.type || 'application/octet-stream'
  const ext = ALLOWED[mime]
  if (!ext) {
    return {
      error: 'That file type is not supported. You can send photos, video, audio, PDF or Word documents.',
      status: 400,
    }
  }

  const stored = `inq-${Date.now()}-${randomBytes(8).toString('hex')}${ext}`
  const dir = path.join(process.cwd(), 'uploads')
  await fs.mkdir(dir, { recursive: true }).catch(() => {})
  await fs.writeFile(path.join(dir, stored), Buffer.from(await file.arrayBuffer()))

  // Relative URL on purpose: the hub answers on more than one hostname, and a
  // baked-in absolute URL is how an attachment ends up pointing at the wrong
  // one once a link is shared.
  return {
    fileUrl: `/api/uploads/${stored}`,
    // Strip any path the browser included, and keep the label short.
    fileName: (file.name || 'attachment').split(/[\\/]/).pop()!.slice(0, 160),
    fileMime: mime,
    fileSize: file.size,
  }
}

export function isProblem(r: StoredFile | UploadProblem): r is UploadProblem {
  return 'error' in r
}
