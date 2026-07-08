/**
 * Games — Voucher issue on win
 *
 * POST /api/public/games/win
 * Body: { firstName, email, correct, tier }  (tier: 5 | 8)
 *
 * Public, unauthenticated. Generates a unique Verdana Trainings & Seminars
 * discount voucher code and emails it to the player, then returns the code
 * so the win screen can show it. Rewards:
 *   - 15..19 correct → 5% voucher
 *   - 20+   correct  → 8% voucher
 *
 * The code is self-describing (tier + short random suffix); we do not persist
 * it here — Verdana redeems against the "marketing-games" batch prefix.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sendTransactionalEmail } from '@/lib/transactional-email'
import { isGameEnabled } from '@/lib/games-settings'

export const runtime = 'nodejs'

// Unambiguous alphabet (no 0/O/1/I) for a code people type off a screen.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

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

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'Valid email required.' }, { status: 400 })
  }

  // Respect the admin on/off switch — a disabled game never mints a voucher.
  if (!(await isGameEnabled(game))) {
    return NextResponse.json(
      { ok: false, error: 'This game is not accepting entries right now.' },
      { status: 403 },
    )
  }

  // Each game has its own winning rule. The Flappy round is a fixed 5% prize;
  // the trivia round pays 5% at 15 correct and 8% at 20.
  let tier: 5 | 8
  if (game === 'slp-flappy') {
    tier = 5
  } else {
    if (!Number.isFinite(correct) || correct < 15) {
      return NextResponse.json({ ok: false, error: 'Score does not qualify for a voucher.' }, { status: 400 })
    }
    tier = correct >= 20 ? 8 : 5
  }

  const code = `AURA-SLP${tier}-${randomSuffix()}`

  // Record the voucher in the HR Platform so it shows up under Seminars &
  // Trainings → Marketing Vouchers and can be redeemed exactly once. Best-effort:
  // never block the win screen if HR is briefly unreachable (the player still
  // gets their on-screen + emailed code; staff can add it manually if needed).
  recordVoucherInHR({ code, tier, firstName, lastName, email, game, correct }).catch((e) =>
    console.error('[games/win] HR voucher record failed:', e?.message || e),
  )

  // Email is best-effort — never block the win screen on a mail hiccup. The
  // player already sees the code on-screen; email is the durable copy.
  let emailed = false
  try {
    await sendTransactionalEmail({
      to: email,
      subject: `You won a ${tier}% Verdana Trainings & Seminars voucher! 🎉`,
      html: voucherEmailHtml({ firstName, tier, code, correct, game }),
    })
    emailed = true
  } catch (e: any) {
    console.error('[games/win] voucher email failed:', e?.message || e)
  }

  return NextResponse.json({ ok: true, code, tier, emailed })
}

const HR_URL = process.env.HR_PLATFORM_URL || 'http://127.0.0.1:3457'
const HR_KEY = process.env.HR_PLATFORM_API_KEY || process.env.EXTERNAL_API_KEY || ''

async function recordVoucherInHR(v: {
  code: string
  tier: number
  firstName: string
  lastName: string
  email: string
  game: string
  correct: number
}): Promise<void> {
  const res = await fetch(`${HR_URL}/marketing-vouchers/issue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${HR_KEY}` },
    body: JSON.stringify(v),
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  })
  if (!res.ok) throw new Error(`HR responded ${res.status}`)
}

function voucherEmailHtml(p: {
  tier: number
  code: string
  correct: number
  firstName: string
  game: string
}): string {
  const teal = '#244952'
  const gold = '#c69849'
  const earned =
    p.game === 'slp-flappy'
      ? `You caught the cherub in <strong>Flappy Phoneme</strong> and earned a`
      : `You answered <strong>${p.correct}</strong> correct in the SLP Speed Round and earned a`
  return `<!doctype html>
<html><body style="margin:0;background:#f7faf1;font-family:Inter,-apple-system,Segoe UI,sans-serif;color:#223841">
  <div style="max-width:520px;margin:0 auto;padding:28px 20px">
    <div style="background:#fff;border:1px solid #dde6d4;border-radius:16px;overflow:hidden">
      <div style="background:${teal};padding:26px 28px;color:#fff">
        <div style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;opacity:.85">Aura Health &middot; Verdana Trainings &amp; Seminars</div>
        <div style="font-size:24px;font-weight:800;margin-top:6px">Nice one, ${escapeHtml(p.firstName)}! 🦙</div>
      </div>
      <div style="padding:26px 28px">
        <p style="margin:0 0 14px;font-size:16px;line-height:1.55">
          ${earned}
          <strong>${p.tier}% discount</strong> on your next Verdana Trainings &amp; Seminars enrollment.
        </p>
        <div style="border:2px dashed ${gold};border-radius:12px;padding:18px;text-align:center;margin:18px 0;background:#fbf7ec">
          <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#8a6a2f">Your voucher code</div>
          <div style="font-size:28px;font-weight:800;letter-spacing:.06em;color:${teal};margin-top:6px">${p.code}</div>
        </div>
        <p style="margin:0 0 6px;font-size:14px;line-height:1.55;color:#5d6f6a">
          Present this code when you enroll in an upcoming Verdana seminar or training to claim your ${p.tier}% discount.
          One voucher per person. Not convertible to cash.
        </p>
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
