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
        width: '100%', maxWidth: '400px',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 4px 32px rgba(36,73,82,0.10), 0 1px 4px rgba(0,0,0,0.04)',
        background: '#fff',
        border: '1px solid var(--light-gray)',
      }}>
        {/* Aura accent bar */}
        <div style={{ height: '4px', background: 'linear-gradient(90deg, #244952, #4a8073)' }} />

        <div style={{ padding: '36px 32px 32px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--charcoal)', margin: '0 0 4px', fontFamily: 'var(--font-display)' }}>
            Schedule Access
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--mid-gray)', margin: '0 0 28px', fontFamily: 'var(--font-body)' }}>
            Enter the access code to view clinic schedules.
          </p>

          <form action={verifyCode}>
            <input type="hidden" name="next" value={next} />

            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--mid-gray)',
                marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.08em',
                fontFamily: 'var(--font-body)',
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
                  padding: '11px 16px', fontSize: '15px',
                  border: hasError ? '1.5px solid var(--destructive)' : '1.5px solid var(--input)',
                  borderRadius: '10px', outline: 'none',
                  color: 'var(--charcoal)', background: '#fff',
                  fontFamily: 'var(--font-body)',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
              />
              {hasError && (
                <p style={{ fontSize: '12px', color: 'var(--destructive)', margin: '8px 0 0', fontFamily: 'var(--font-body)' }}>
                  Incorrect code. Please try again.
                </p>
              )}
            </div>

            <button
              type="submit"
              style={{
                width: '100%', padding: '12px',
                background: '#244952', color: '#fff',
                fontWeight: 700, fontSize: '14px',
                border: 'none', borderRadius: '10px',
                cursor: 'pointer', letterSpacing: '0.03em',
                fontFamily: 'var(--font-display)',
                transition: 'background 0.2s, transform 0.1s',
                boxShadow: '0 2px 8px rgba(36,73,82,0.2)',
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
