/**
 * Games — prize claim on win
 *
 * POST /api/public/games/win
 * Body: { firstName, lastName, email, correct, tier, game, prize }
 *   prize: 'discount' | 'merch'
 *
 * Public. The player chooses a prize on the win screen:
 *   - discount → a unique Verdana Trainings & Seminars voucher (5% / 8%)
 *   - merch    → a merch claim code to show at the booth
 * Recorded in HR (one per email — a second attempt returns the first prize)
 * and emailed. Returns the canonical code so the win screen can show it.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sendTransactionalEmail } from '@/lib/transactional-email'
import { isGameEnabled } from '@/lib/games-settings'

export const runtime = 'nodejs'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I

function randomSuffix(len = 5): string {
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 })
  }

  const firstName = String(body.firstName ?? '').trim() || 'there'
  const lastName = String(body.lastName ?? '').trim()
  const email = String(body.email ?? '').trim()
  const correct = Number(body.correct ?? 0)
  const game = String(body.game ?? 'slp-quiz')
  const prize: 'discount' | 'merch' = body.prize === 'merch' ? 'merch' : 'discount'

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'Valid email required.' }, { status: 400 })
  }

  // Respect the admin on/off switch — a disabled game never awards a prize.
  if (!(await isGameEnabled(game))) {
    return NextResponse.json(
      { ok: false, error: 'This game is not accepting entries right now.' },
      { status: 403 },
    )
  }

  // Discount tier: Flappy is a flat 5%; trivia pays 5% at 15 correct, 8% at 20.
  let tier: 5 | 8
  if (game === 'slp-flappy') {
    tier = 5
  } else {
    if (!Number.isFinite(correct) || correct < 15) {
      return NextResponse.json({ ok: false, error: 'Score does not qualify for a prize.' }, { status: 400 })
    }
    tier = correct >= 20 ? 8 : 5
  }

  const candidateCode = prize === 'merch' ? `AURA-MERCH-${randomSuffix()}` : `AURA-SLP${tier}-${randomSuffix()}`
  const candidateTier = prize === 'merch' ? 0 : tier

  // Record in HR, which enforces one prize per email: if this person already
  // claimed, HR returns that original prize (alreadyClaimed=true). Fail OPEN if
  // HR is unreachable so the player still gets their on-screen + emailed code.
  let code = candidateCode
  let finalTier = candidateTier
  let finalPrize = prize
  let alreadyClaimed = false
  try {
    const rec = await recordVoucherInHR({
      code: candidateCode,
      tier: candidateTier,
      prize,
      firstName,
      lastName,
      email,
      game,
      correct,
    })
    if (rec?.voucher) {
      code = rec.voucher.code || candidateCode
      finalTier = Number(rec.voucher.tier ?? candidateTier)
      finalPrize = rec.voucher.prize === 'merch' ? 'merch' : 'discount'
      alreadyClaimed = !!rec.duplicate
    }
  } catch (e: any) {
    console.error('[games/win] HR record failed (issuing local code):', e?.message || e)
  }

  // Email is best-effort — never block the win screen on a mail hiccup.
  let emailed = false
  try {
    await sendTransactionalEmail({
      to: email,
      subject:
        finalPrize === 'merch'
          ? 'Your Aura Health merch prize 🎁'
          : `You won a ${finalTier}% Verdana Trainings & Seminars voucher! 🎉`,
      html: prizeEmailHtml({ firstName, tier: finalTier, code, correct, game, prize: finalPrize }),
    })
    emailed = true
  } catch (e: any) {
    console.error('[games/win] prize email failed:', e?.message || e)
  }

  return NextResponse.json({ ok: true, code, tier: finalTier, prize: finalPrize, emailed, alreadyClaimed })
}

const HR_URL = process.env.HR_PLATFORM_URL || 'http://127.0.0.1:3457'
const HR_KEY = process.env.HR_PLATFORM_API_KEY || process.env.EXTERNAL_API_KEY || ''

type HrIssueResponse = {
  ok: boolean
  voucher?: { code: string; tier: number; prize: string; redeemed: boolean }
  duplicate?: boolean
}

async function recordVoucherInHR(v: {
  code: string
  tier: number
  prize: string
  firstName: string
  lastName: string
  email: string
  game: string
  correct: number
}): Promise<HrIssueResponse> {
  const res = await fetch(`${HR_URL}/marketing-vouchers/issue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${HR_KEY}` },
    body: JSON.stringify(v),
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  })
  const data = (await res.json().catch(() => null)) as HrIssueResponse | null
  if (!res.ok || !data?.ok) throw new Error(`HR responded ${res.status}`)
  return data
}

function prizeEmailHtml(p: {
  tier: number
  code: string
  correct: number
  firstName: string
  game: string
  prize: 'discount' | 'merch'
}): string {
  const teal = '#244952'
  const gold = '#c69849'
  const wonLine =
    p.game === 'slp-flappy'
      ? `You caught the cherub in <strong>Flappy Phoneme</strong>`
      : `You answered <strong>${p.correct}</strong> correct in the SLP Speed Round`
  const body =
    p.prize === 'merch'
      ? `${wonLine} and picked <strong>Aura Health merch</strong> as your prize.`
      : `${wonLine} and earned a <strong>${p.tier}% discount</strong> on your next Verdana Trainings &amp; Seminars enrollment.`
  const codeLabel = p.prize === 'merch' ? 'Your merch claim code' : 'Your voucher code'
  const footNote =
    p.prize === 'merch'
      ? 'Show this code at our booth to grab your merch. One prize per person.'
      : `Present this code when you enroll in an upcoming Verdana seminar or training to claim your ${p.tier}% discount. One prize per person. Not convertible to cash.`
  return `<!doctype html>
<html><body style="margin:0;background:#f7faf1;font-family:Inter,-apple-system,Segoe UI,sans-serif;color:#223841">
  <div style="max-width:520px;margin:0 auto;padding:28px 20px">
    <div style="background:#fff;border:1px solid #dde6d4;border-radius:16px;overflow:hidden">
      <div style="background:${teal};padding:26px 28px;color:#fff">
        <div style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;opacity:.85">Aura Health &middot; Verdana Trainings &amp; Seminars</div>
        <div style="font-size:24px;font-weight:800;margin-top:6px">Nice one, ${escapeHtml(p.firstName)}! 🦙</div>
      </div>
      <div style="padding:26px 28px">
        <p style="margin:0 0 14px;font-size:16px;line-height:1.55">${body}</p>
        <div style="border:2px dashed ${gold};border-radius:12px;padding:18px;text-align:center;margin:18px 0;background:#fbf7ec">
          <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#8a6a2f">${codeLabel}</div>
          <div style="font-size:28px;font-weight:800;letter-spacing:.06em;color:${teal};margin-top:6px">${p.code}</div>
        </div>
        <p style="margin:0 0 6px;font-size:14px;line-height:1.55;color:#5d6f6a">${footNote}</p>
      </div>
      <div style="padding:16px 28px;border-top:1px solid #dde6d4;font-size:12px;color:#9aa89f">
        Sapphire Clinics East, Inc. &middot; Aura Health Rehab
      </div>
    </div>
  </div>
</body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))
}
