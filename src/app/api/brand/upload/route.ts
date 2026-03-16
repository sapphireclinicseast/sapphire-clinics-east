import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { analyzeBrandGuide, analyzeBrandGuidePdf } from '@/lib/openai'
import { writeFile } from 'fs/promises'
import path from 'path'

// Allow up to 20MB uploads (nginx is set to 25m)
export const maxDuration = 120 // 2 min timeout for large PDFs + Claude analysis

const MAX_BYTES = 20 * 1024 * 1024 // 20 MB
// Claude document API supports PDFs up to ~32MB raw — send the full PDF, never truncate
// (truncating produces an invalid PDF and causes a 400 error from the API)

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Failed to parse upload. File may be too large (max 20MB).' }, { status: 413 })
  }

  const file = form.get('file') as File | null
  const brandName = (form.get('name') as string | null)?.trim() || null

  if (!file) return NextResponse.json({ error: 'File required' }, { status: 400 })
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File too large (${Math.round(file.size / 1024 / 1024)}MB). Maximum is 20MB.` }, { status: 413 })
  }

  try {
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const filename = `brand-guide-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`
    const uploadPath = path.join(process.cwd(), 'uploads', filename)
    await writeFile(uploadPath, buffer)

    const isPdf = file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf')
    let style: { colors: string[]; fonts: string[]; tone: string; styleNotes: string }

    if (isPdf) {
      // Try native PDF analysis first; fall back to text extraction if PDF is rejected
      try {
        const pdfBase64 = buffer.toString('base64')
        style = await analyzeBrandGuidePdf(pdfBase64)
      } catch (pdfErr: any) {
        const msg: string = pdfErr?.message ?? ''
        // Anthropic rejects encrypted, DRM-protected, or malformed PDFs
        if (msg.includes('invalid_request_error') || msg.includes('pdf') || msg.includes('PDF') || msg.includes('not valid')) {
          // Fall back: extract readable text from the buffer (works for unencrypted PDFs)
          const rawText = buffer.toString('latin1').replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s{3,}/g, '\n')
          style = await analyzeBrandGuide(rawText)
        } else {
          throw pdfErr
        }
      }
    } else {
      const text = buffer.toString('utf-8')
      style = await analyzeBrandGuide(text)
    }

    const guide = await prisma.brandGuide.create({
      data: {
        name: brandName,
        fileName: file.name,
        fileUrl: `/api/uploads/${filename}`,
        analyzedAt: new Date(),
        styleJson: style,
      },
    })

    return NextResponse.json({ guide, style })
  } catch (err) {
    console.error('Brand guide upload error:', err)
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { error: `Upload failed: ${msg}. Make sure your Anthropic API key is configured.` },
      { status: 500 }
    )
  }
}
