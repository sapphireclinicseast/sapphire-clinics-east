import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

async function verifyCode(formData: FormData) {
  'use server'
  const code    = (formData.get('code') as string ?? '').trim()
  const next    = (formData.get('next') as string ?? '').trim()
  const safNext = next.startsWith('/') ? next : '/'

  if (code === 'scei') {
    const cookieStore = await cookies()
    cookieStore.set('sched_access', 'scei', {
      httpOnly: true,
      maxAge:   86400,
      path:     '/',
      sameSite: 'strict',
    })
    redirect(safNext || '/')
  }

  const errorUrl = `/?error=invalid${next ? `&next=${encodeURIComponent(next)}` : ''}`
  redirect(errorUrl)
}

export default async function SchedulesGatePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const params     = await searchParams
  const next       = params.next ?? ''
  const hasError   = params.error === 'invalid'

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '55vh' }}>
      <div style={{
        width: '100%', maxWidth: '380px',
        background: '#fff',
        border: '1px solid #C8D6CF',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(27,63,56,0.10)',
      }}>
        {/* Narra → Sun accent bar (Narra + Sun: hero moment, warmth) */}
        <div style={{ height: '6px', background: 'linear-gradient(90deg,#1B3F38 0%,#4A8073 60%,#C69849 100%)' }} />

        <div style={{ padding: '32px 28px 28px' }}>
          <h1 className="sched-display" style={{
            fontSize: '22px', fontWeight: 700, color: '#1B3F38',
            margin: '0 0 6px', letterSpacing: '-0.01em',
          }}>
            Schedule Access
          </h1>
          <p style={{ fontSize: '13px', color: '#1A1A1A', opacity: 0.65, margin: '0 0 24px', lineHeight: 1.5 }}>
            Enter the access code to view clinic schedules.
          </p>

          <form action={verifyCode}>
            <input type="hidden" name="next" value={next} />

            <div style={{ marginBottom: '18px' }}>
              <label className="sched-display" style={{
                display: 'block', fontSize: '11px', fontWeight: 700,
                color: '#1B3F38', marginBottom: '6px',
                textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>
                Access Code
              </label>
              <input
                name="code"
                type="text"
                autoFocus
                autoComplete="off"
                placeholder="Enter code"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '11px 14px', fontSize: '15px',
                  fontFamily: 'var(--font-manrope), system-ui, sans-serif',
                  border: hasError ? '1.5px solid #A85C3D' : '1.5px solid #C8D6CF',
                  borderRadius: '8px', outline: 'none',
                  color: '#1A1A1A', background: '#fff',
                  transition: 'border-color 0.15s',
                }}
              />
              {hasError && (
                <p style={{ fontSize: '12px', color: '#A85C3D', margin: '6px 0 0', fontWeight: 500 }}>
                  Incorrect code. Please try again.
                </p>
              )}
            </div>

            <button
              type="submit"
              className="sched-display"
              style={{
                width: '100%', padding: '12px',
                background: '#1B3F38', color: '#fff',
                fontWeight: 700, fontSize: '13px',
                border: 'none', borderRadius: '8px',
                cursor: 'pointer', letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              Continue
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
