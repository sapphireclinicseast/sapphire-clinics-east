/**
 * POST /api/manuals/[id]/chat
 *
 * Grounded chatbot for a department manual. Answers strictly from the
 * manual's extracted text (fetched from the HR hub, service-key gated),
 * and cites page numbers. The model never sees anything but the manual
 * text + the user's question — it is not a general assistant.
 *
 * Scope is re-checked on every call (same as the page-image route), so a
 * clinician can only query manuals their department is allowed to see.
 */
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { auth } from '@/lib/auth'
import { allowedDeptsFor, manualInScope } from '@/lib/manual-scope'

const HR_API_BASE = process.env.HR_API_BASE ?? 'https://hr.sapphireclinicseast.org/api'
const HR_KEY = process.env.TELETHERAPY_HR_API_KEY ?? ''
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'

// How much manual text to send in full before falling back to per-page
// keyword retrieval (~30k tokens ≈ 120k chars). Small manuals are sent
// whole and prompt-cached; large ones are narrowed to the top pages.
const FULL_TEXT_CHAR_BUDGET = 120_000
const RETRIEVE_CHAR_BUDGET = 60_000

interface ManualPage { page: number; content: string }
interface ManualContent { id: string; name: string; pageCount: number; text: ManualPage[] }

// In-process cache of manual content (per server instance). Manuals change
// rarely; a short TTL keeps memory bounded and picks up edits within minutes.
const contentCache = new Map<string, { at: number; data: ManualContent }>()
const CONTENT_TTL_MS = 10 * 60 * 1000

async function getManualContent(id: string): Promise<ManualContent | null> {
  const cached = contentCache.get(id)
  // Date.now is fine here (server runtime), only avoided inside workflow scripts.
  const now = Date.now()
  if (cached && now - cached.at < CONTENT_TTL_MS) return cached.data
  const res = await fetch(`${HR_API_BASE}/manuals/${id}/content`, {
    headers: { 'x-api-key': HR_KEY },
    cache: 'no-store',
  })
  if (!res.ok) return null
  const json = (await res.json()) as { ok: boolean } & ManualContent
  if (!json.ok) return null
  const data: ManualContent = {
    id: json.id,
    name: json.name,
    pageCount: json.pageCount ?? 0,
    text: Array.isArray(json.text) ? json.text : [],
  }
  contentCache.set(id, { at: now, data })
  return data
}

/** Pick the pages most relevant to the question, preserving page order. */
function selectPages(pages: ManualPage[], question: string): ManualPage[] {
  const total = pages.reduce((n, p) => n + (p.content?.length ?? 0), 0)
  if (total <= FULL_TEXT_CHAR_BUDGET) return pages

  const terms = (question.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])
  const scored = pages.map((p) => {
    const hay = (p.content ?? '').toLowerCase()
    const score = terms.reduce((s, t) => s + (hay.includes(t) ? hay.split(t).length - 1 : 0), 0)
    return { p, score }
  })
  const ranked = [...scored].sort((a, b) => b.score - a.score)
  const keep = new Set<number>()
  let used = 0
  for (const { p } of ranked) {
    if (used + (p.content?.length ?? 0) > RETRIEVE_CHAR_BUDGET && keep.size > 0) break
    keep.add(p.page)
    used += p.content?.length ?? 0
  }
  return pages.filter((p) => keep.has(p.page))
}

function buildManualBlock(name: string, pages: ManualPage[]): string {
  const body = pages
    .filter((p) => (p.content ?? '').trim().length > 0)
    .map((p) => `[Page ${p.page}]\n${p.content.trim()}`)
    .join('\n\n')
  return `MANUAL: ${name}\n\n${body}`
}

const SYSTEM_INSTRUCTIONS =
  'You are a helpful assistant that answers staff questions about a single ' +
  'department manual. Answer ONLY using the manual text provided below. ' +
  'When you state a fact, cite the page it came from like "(p. 3)". ' +
  'If the answer is not contained in the manual, say so plainly — do not ' +
  'guess or use outside knowledge. Keep answers concise and practical.'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'The manual assistant is not configured on this server yet.' },
      { status: 503 },
    )
  }

  const { id } = await params
  let body: { question?: string }
  try {
    body = (await req.json()) as { question?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const question = (body.question ?? '').trim()
  if (!question) return NextResponse.json({ error: 'Question is required' }, { status: 400 })
  if (question.length > 2000) {
    return NextResponse.json({ error: 'Question is too long' }, { status: 400 })
  }

  // Scope check — confirm this manual is visible to the user's department.
  const myRole = (session.user as { role?: string }).role ?? ''
  const allowed = allowedDeptsFor(myRole, (session.user as { department?: string }).department ?? '')
  let listRes: Response
  try {
    listRes = await fetch(`${HR_API_BASE}/manuals/public`, { cache: 'no-store' })
  } catch {
    return NextResponse.json({ error: 'HR hub unreachable' }, { status: 502 })
  }
  if (!listRes.ok) return NextResponse.json({ error: 'Upstream error' }, { status: 502 })
  const listData = (await listRes.json()) as {
    manuals?: { id: string; departments: string[] }[]
  }
  const meta = (listData.manuals ?? []).find((m) => m.id === id)
  if (!meta) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!manualInScope(meta.departments, allowed)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const content = await getManualContent(id)
  if (!content || content.text.length === 0) {
    return NextResponse.json(
      { error: 'This manual has no searchable text (it may be a scanned PDF).' },
      { status: 422 },
    )
  }

  const pages = selectPages(content.text, question)
  const manualBlock = buildManualBlock(content.name, pages)

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  let answer = ''
  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [
        { type: 'text', text: SYSTEM_INSTRUCTIONS },
        // Cache the (stable) manual text so repeat questions are cheap.
        { type: 'text', text: manualBlock, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: question }],
    })
    answer = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      console.error(`[manual-chat] Anthropic error ${e.status}:`, e.message)
    } else {
      console.error('[manual-chat] error:', e)
    }
    return NextResponse.json({ error: 'The assistant could not answer right now.' }, { status: 502 })
  }

  if (!answer) {
    return NextResponse.json({ error: 'The assistant returned an empty answer.' }, { status: 502 })
  }

  // Pull cited page numbers out of the answer for jump-to-page in the UI.
  const cited = Array.from(answer.matchAll(/\(?\bp\.?\s*(\d+)\)?/gi))
    .map((m) => parseInt(m[1], 10))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= content.pageCount)
  const pagesCited = Array.from(new Set(cited)).sort((a, b) => a - b)

  return NextResponse.json({ answer, pages: pagesCited })
}
