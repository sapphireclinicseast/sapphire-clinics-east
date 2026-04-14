'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Settings, Save, Loader2, CheckCircle2, Award, FileText, PenTool, KeyRound, Eye, EyeOff } from 'lucide-react'
import SignaturePad from '@/components/SignaturePad'

export default function SettingsPage() {
  const { data: session } = useSession()

  const [licenseNo, setLicenseNo] = useState('')
  const [ptrNo, setPtrNo] = useState('')
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // Password change
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-[var(--teal)]" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--charcoal)] flex items-center gap-3" style={{ fontFamily: 'var(--font-display)' }}>
          <div className="w-10 h-10 bg-[var(--pale-teal)] rounded-xl flex items-center justify-center">
            <Settings size={22} className="text-[var(--teal)]" />
          </div>
          Clinician Settings
        </h1>
        <p className="text-[13px] text-[var(--mid-gray)] mt-2 ml-[52px]">
          Configure your credentials and signature. These will auto-fill in session note forms.
        </p>
      </div>

      {/* PRC License & PTR */}
      <div className="card-static mb-6">
        <h2 className="text-[14px] font-bold text-[var(--charcoal)] mb-4 flex items-center gap-2 pb-3 border-b border-[var(--light-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
          <Award size={18} className="text-[var(--sand-dark)]" />
          Professional Credentials
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[12px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-1.5">
              <FileText size={12} className="inline mr-1 -mt-0.5" />
              PRC License No.
            </label>
            <input
              value={licenseNo}
              onChange={(e) => setLicenseNo(e.target.value)}
              placeholder="Enter your PRC License No."
              className="input text-[13px]"
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-1.5">
              <FileText size={12} className="inline mr-1 -mt-0.5" />
              PTR No.
            </label>
            <input
              value={ptrNo}
              onChange={(e) => setPtrNo(e.target.value)}
              placeholder="Enter your PTR No."
              className="input text-[13px]"
            />
          </div>
        </div>

        <p className="text-[11px] text-[var(--mid-gray)] mt-3">
          These will auto-fill in OT Daily Notes and other session forms that require credentials.
        </p>
      </div>

      {/* Signature */}
      <div className="card-static mb-6">
        <h2 className="text-[14px] font-bold text-[var(--charcoal)] mb-4 flex items-center gap-2 pb-3 border-b border-[var(--light-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
          <PenTool size={18} className="text-[var(--teal)]" />
          Digital Signature
        </h2>

        <SignaturePad
          initialDataUrl={signatureDataUrl}
          onChange={setSignatureDataUrl}
        />

        <p className="text-[11px] text-[var(--mid-gray)] mt-3">
          Your signature will auto-fill in session note forms. You can draw with your mouse, finger (on touchscreen), or upload an image.
        </p>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="btn-primary w-full py-3.5 rounded-xl flex items-center justify-center gap-2 text-[14px] font-semibold"
      >
        {saving ? (
          <><Loader2 size={18} className="animate-spin" /> Saving...</>
        ) : saved ? (
          <><CheckCircle2 size={18} /> Saved!</>
        ) : (
          <><Save size={18} /> Save Settings</>
        )}
      </button>

      {/* ── Change Password Section ──────────────────────────────── */}
      <div className="mt-8 pt-6 border-t border-[var(--light-gray)]">
        <h3 className="font-semibold text-[var(--charcoal)] mb-4 flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
          <KeyRound size={18} className="text-[var(--teal)]" />
          Change Password
        </h3>

        <div className="space-y-3">
          <div>
            <label className="block text-[12px] font-semibold text-[var(--charcoal)] mb-1">Current Password</label>
            <div className="relative">
              <input
                type={showCurrentPw ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="input text-[13px] pr-10"
                placeholder="Enter current password"
              />
              <button type="button" onClick={() => setShowCurrentPw(!showCurrentPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--mid-gray)] hover:text-[var(--charcoal)]">
                {showCurrentPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-[var(--charcoal)] mb-1">New Password</label>
            <div className="relative">
              <input
                type={showNewPw ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input text-[13px] pr-10"
                placeholder="Enter new password (min 6 characters)"
              />
              <button type="button" onClick={() => setShowNewPw(!showNewPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--mid-gray)] hover:text-[var(--charcoal)]">
                {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-[var(--charcoal)] mb-1">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input text-[13px]"
              placeholder="Re-enter new password"
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-[11px] text-red-500 mt-1">Passwords do not match</p>
            )}
          </div>

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
            className="btn-primary w-full py-3 rounded-xl flex items-center justify-center gap-2"
          >
            {changingPassword ? (
              <><Loader2 size={16} className="animate-spin" /> Changing...</>
            ) : (
              <><KeyRound size={16} /> Change Password</>
            )}
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[var(--charcoal)] text-white px-6 py-3 rounded-2xl shadow-2xl text-[13px] font-medium animate-fade-up z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
