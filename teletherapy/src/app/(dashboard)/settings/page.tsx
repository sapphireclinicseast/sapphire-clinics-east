'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Save, Loader2, CheckCircle2, Award, PenTool, KeyRound, Eye, EyeOff, FileSignature, Download, ExternalLink, UserRound } from 'lucide-react'
import SignaturePad from '@/components/SignaturePad'
import {
  Avatar, BTN_PRIMARY, BTN_SECONDARY, CARD_STYLE, CONTROL, CONTROL_STYLE, DANGER, DashCard, LABEL, LABEL_STYLE,
  PAGE, PageHeader, PRIMARY_STYLE, RowsSkeleton, SECONDARY_STYLE, Skeleton, Tag,
} from '@/components/hub/ui'
import { branchLabel } from '@/lib/branch-label'

const ACCOUNT_LABEL: Record<string, string> = {
  CLINICIAN: 'Clinician', INTERN: 'Intern', FRONT_DESK: 'Front Desk', ADMIN_STAFF: 'Administration', ADMIN: 'Admin',
}
/* Session names are often ALL CAPS; \p{L} + u keeps ñ inside a word. */
function niceName(name: string): string {
  const n = (name || '').trim()
  if (!n || n !== n.toUpperCase()) return n
  return n.toLowerCase().replace(/(^|[\s\-'.(])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase())
}
const ICON_BTN = 'absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-md flex items-center justify-center transition-colors hover:bg-[#F8FAF2]'

export default function SettingsPage() {
  const { data: session } = useSession()
  // Interns aren't licensed practitioners yet — no PRC License / PTR fields.
  const isIntern = (session?.user as { accountType?: string } | undefined)?.accountType === 'INTERN'

  const [licenseNo, setLicenseNo] = useState('')
  const [ptrNo, setPtrNo] = useState('')
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  // What's on the server, to tell whether there are unsaved edits.
  const [savedValues, setSavedValues] = useState({ licenseNo: '', ptrNo: '', signatureDataUrl: null as string | null })
  const [toast, setToast] = useState<string | null>(null)
  // My Contract — the employment contract HR filed under this account's email.
  const [contract, setContract] = useState<{ originalName: string; size: number; uploadedAt: string } | null | undefined>(undefined)
  useEffect(() => {
    fetch('/api/contract').then((r) => (r.ok ? r.json() : { contract: null })).then((d) => setContract(d.contract ?? null)).catch(() => setContract(null))
  }, [])

  // Password change
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    fetchSettings()
  }, [])

  async function fetchSettings() {
    setLoading(true)
    try {
      const res = await fetch('/api/clinician-settings')
      if (res.ok) {
        const data = await res.json()
        if (data.settings) {
          setLicenseNo(data.settings.licenseNo ?? '')
          setPtrNo(data.settings.ptrNo ?? '')
          setSignatureDataUrl(data.settings.signatureDataUrl ?? null)
          setSavedValues({ licenseNo: data.settings.licenseNo ?? '', ptrNo: data.settings.ptrNo ?? '', signatureDataUrl: data.settings.signatureDataUrl ?? null })
        }
      }
    } catch {}
    setLoading(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/clinician-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseNo, ptrNo, signatureDataUrl }),
      })
      if (res.ok) {
        setSavedValues({ licenseNo, ptrNo, signatureDataUrl })
        setSaved(true)
        setToast('Settings saved successfully')
        setTimeout(() => { setSaved(false); setToast(null) }, 3000)
      } else {
        setToast('Failed to save settings')
        setTimeout(() => setToast(null), 4000)
      }
    } catch {
      setToast('Failed to save settings')
      setTimeout(() => setToast(null), 4000)
    }
    setSaving(false)
  }

  const accountType = (session?.user as { accountType?: string } | undefined)?.accountType
  const dirty = licenseNo !== savedValues.licenseNo || ptrNo !== savedValues.ptrNo || signatureDataUrl !== savedValues.signatureDataUrl

  if (loading) {
    return (
      <div className={PAGE}>
        <PageHeader eyebrow="My account" title="Settings" description="Your contract, credentials, signature and password." />
        <div className="rounded-xl p-5 space-y-3" style={CARD_STYLE}><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-2/3" /></div>
        <div className="rounded-xl" style={CARD_STYLE}><RowsSkeleton rows={3} label="Loading settings" /></div>
      </div>
    )
  }

  return (
    <div className={PAGE}>
      <PageHeader
        eyebrow="My account"
        title="Settings"
        description="Your contract, credentials, signature and password. Credentials and signature auto-fill in session note forms."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
        <div className="space-y-5 min-w-0">
      {/* PRC License & PTR — hidden for interns (not licensed practitioners) */}
      {!isIntern && (
      <DashCard
        title="Professional Credentials"
        icon={<Award size={16} />}
        footer="These will auto-fill in OT Daily Notes and other session forms that require credentials."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="set-prc" className={LABEL} style={LABEL_STYLE}>PRC License No.</label>
            <input
              id="set-prc"
              value={licenseNo}
              onChange={(e) => setLicenseNo(e.target.value)}
              placeholder="Enter your PRC License No."
              className={`${CONTROL} w-full`}
              style={CONTROL_STYLE}
            />
          </div>
          <div>
            <label htmlFor="set-ptr" className={LABEL} style={LABEL_STYLE}>PTR No.</label>
            <input
              id="set-ptr"
              value={ptrNo}
              onChange={(e) => setPtrNo(e.target.value)}
              placeholder="Enter your PTR No."
              className={`${CONTROL} w-full`}
              style={CONTROL_STYLE}
            />
          </div>
        </div>
      </DashCard>
      )}
      {/* Signature */}
      <DashCard
        title="Digital Signature"
        icon={<PenTool size={16} />}
        footer="Your signature will auto-fill in session note forms. You can draw with your mouse, finger (on touchscreen), or upload an image."
      >
        <SignaturePad
          initialDataUrl={signatureDataUrl}
          onChange={setSignatureDataUrl}
        />
      </DashCard>
      {/* Save — covers credentials + signature. Sticks to the bottom while
          there are unsaved edits so it's never scrolled out of reach. */}
      <div
        className={`rounded-xl px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${dirty ? 'sticky bottom-3 z-10 shadow-[0_6px_20px_rgba(23,50,58,0.12)]' : ''}`}
        style={dirty ? { ...CARD_STYLE, borderColor: 'var(--teal)' } : CARD_STYLE}
        role="status"
      >
        <p className="text-xs" style={{ color: dirty ? 'var(--charcoal)' : 'var(--mid-gray)' }}>
          {dirty
            ? <><strong>Unsaved changes.</strong> {isIntern ? 'Save your signature.' : 'Save your credentials and signature.'}</>
            : (isIntern ? 'Your signature is saved.' : 'Your credentials and signature are saved.')}
        </p>
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className={`${BTN_PRIMARY} !h-10 !px-5`}
          style={PRIMARY_STYLE}
        >
          {saving ? (
            <><Loader2 size={16} className="animate-spin" /> Saving...</>
          ) : saved ? (
            <><CheckCircle2 size={16} /> Saved!</>
          ) : (
            <><Save size={16} /> Save Settings</>
          )}
        </button>
      </div>
        </div>

        <aside className="space-y-5 min-w-0">
      {/* Who this account is — read from the sign-in session. */}
      <DashCard title="Your account" icon={<UserRound size={16} />}>
        <div className="flex items-center gap-3 min-w-0">
          <Avatar text={niceName(session?.user?.name ?? '').split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?'} size={42} />
          <div className="min-w-0">
            <p className="text-[14px] font-semibold truncate" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>{niceName(session?.user?.name ?? '')}</p>
            <p className="text-xs truncate" style={{ color: 'var(--mid-gray)' }} title={session?.user?.email ?? ''}>{session?.user?.email}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {accountType && <Tag tone="brand">{ACCOUNT_LABEL[accountType] ?? accountType}</Tag>}
          {session?.user?.department && <Tag>{session.user.department}</Tag>}
          {session?.user?.branch && <Tag>{branchLabel(session.user.branch)}</Tag>}
        </div>
      </DashCard>
      {/* My Contract — read-only copy of the employment contract HR uploaded */}
      <DashCard
        title="My Contract"
        icon={<FileSignature size={16} />}
        footer="This is a read-only copy for your records. For corrections, contact HR."
      >
        {contract === undefined ? (
          <div className="space-y-2" aria-label="Checking with HR"><Skeleton className="h-4 w-56" /><Skeleton className="h-3 w-40" /></div>
        ) : contract === null ? (
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--mid-gray)' }}>
            No contract on file yet. HR uploads your signed contract in the HR Hub; it will appear here as soon as it is there.
          </p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>
                <FileSignature size={18} aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold truncate max-w-[220px]" style={{ color: 'var(--charcoal)' }} title={contract.originalName}>{contract.originalName}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                  Uploaded {new Date(contract.uploadedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
                  {contract.size ? ` · ${(contract.size / 1024 / 1024).toFixed(2)} MB` : ''} · PDF
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a href="/api/contract/file" target="_blank" rel="noopener" className={BTN_PRIMARY} style={PRIMARY_STYLE}>
                <ExternalLink size={14} /> View
              </a>
              <a href="/api/contract/file?download=1" className={BTN_SECONDARY} style={SECONDARY_STYLE}>
                <Download size={14} /> Download
              </a>
            </div>
          </div>
        )}
      </DashCard>
      {/* ── Change Password Section ──────────────────────────────── */}
      <DashCard title="Change Password" icon={<KeyRound size={16} />} description="At least 6 characters.">
        <div className="space-y-4">
          <div>
            <label htmlFor="set-pw-current" className={LABEL} style={LABEL_STYLE}>Current password</label>
            <div className="relative">
              <input
                id="set-pw-current"
                type={showCurrentPw ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={`${CONTROL} w-full pr-10`}
                style={CONTROL_STYLE}
                placeholder="Enter current password"
                autoComplete="current-password"
              />
              <button type="button" onClick={() => setShowCurrentPw(!showCurrentPw)} aria-label={showCurrentPw ? 'Hide password' : 'Show password'}
                className={ICON_BTN} style={{ color: 'var(--mid-gray)' }}>
                {showCurrentPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
            <div>
              <label htmlFor="set-pw-new" className={LABEL} style={LABEL_STYLE}>New password</label>
              <div className="relative">
                <input
                  id="set-pw-new"
                  type={showNewPw ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={`${CONTROL} w-full pr-10`}
                  style={CONTROL_STYLE}
                  placeholder="Min 6 characters"
                  autoComplete="new-password"
                />
                <button type="button" onClick={() => setShowNewPw(!showNewPw)} aria-label={showNewPw ? 'Hide password' : 'Show password'}
                  className={ICON_BTN} style={{ color: 'var(--mid-gray)' }}>
                  {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="set-pw-confirm" className={LABEL} style={LABEL_STYLE}>Confirm new password</label>
              <input
                id="set-pw-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`${CONTROL} w-full`}
                style={confirmPassword && newPassword !== confirmPassword ? { ...CONTROL_STYLE, borderColor: '#FECACA' } : CONTROL_STYLE}
                placeholder="Re-enter new password"
                autoComplete="new-password"
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p role="alert" className="text-xs mt-1" style={{ color: DANGER }}>Passwords do not match</p>
              )}
            </div>
          </div>

          <div className="flex justify-end">
          <button
            onClick={async () => {
              if (!currentPassword || !newPassword) {
                showToast('Please fill in all password fields')
                return
              }
              if (newPassword.length < 6) {
                showToast('New password must be at least 6 characters')
                return
              }
              if (newPassword !== confirmPassword) {
                showToast('Passwords do not match')
                return
              }
              setChangingPassword(true)
              try {
                const res = await fetch('/api/auth/change-password', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ currentPassword, newPassword }),
                })
                const data = await res.json()
                if (res.ok) {
                  showToast('Password changed successfully')
                  setCurrentPassword('')
                  setNewPassword('')
                  setConfirmPassword('')
                } else {
                  showToast(data.error ?? 'Failed to change password')
                }
              } catch {
                showToast('Failed to change password')
              }
              setChangingPassword(false)
            }}
            disabled={changingPassword || !currentPassword || !newPassword || newPassword !== confirmPassword}
            className={`${BTN_PRIMARY} !h-10 !px-5`}
            style={PRIMARY_STYLE}
          >
            {changingPassword ? (
              <><Loader2 size={16} className="animate-spin" /> Changing...</>
            ) : (
              <><KeyRound size={16} /> Change Password</>
            )}
          </button>
          </div>
        </div>
      </DashCard>
        </aside>
      </div>

      {/* Toast */}
      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl shadow-2xl text-[13px] font-medium animate-fade-up z-50 text-white" style={{ background: 'var(--deep-teal)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
