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
        border: '1px solid #f0e8e2',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(237,104,35,0.10)',
      }}>
        {/* Orange accent bar */}
        <div style={{ height: '6px', background: 'linear-gradient(90deg,#ED6823,#FFA235)' }} />

        <div style={{ padding: '32px 28px 28px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#000', margin: '0 0 4px' }}>
            Schedule Access
          </h1>
          <p style={{ fontSize: '13px', color: '#777', margin: '0 0 24px' }}>
            Enter the access code to view clinic schedules.
          </p>

          <form action={verifyCode}>
            <input type="hidden" name="next" value={next} />

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#555', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                  padding: '10px 14px', fontSize: '15px',
                  border: hasError ? '1.5px solid #dc2626' : '1.5px solid #e5e7eb',
                  borderRadius: '8px', outline: 'none',
                  color: '#111', background: '#fff',
                }}
              />
              {hasError && (
                <p style={{ fontSize: '12px', color: '#dc2626', margin: '6px 0 0' }}>
                  Incorrect code. Please try again.
                </p>
              )}
            </div>

            <button
              type="submit"
              style={{
                width: '100%', padding: '11px',
                background: '#ED6823', color: '#fff',
                fontWeight: 700, fontSize: '14px',
                border: 'none', borderRadius: '8px',
                cursor: 'pointer', letterSpacing: '0.02em',
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
