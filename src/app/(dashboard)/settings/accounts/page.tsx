'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Facebook,
  Instagram,
  Plus,
  Trash2,
  Zap,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  RefreshCw,
  Mail,
  KeyRound,
} from 'lucide-react'

interface SocialAccount {
  id: string
  platform: 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK'
  pageName: string
  accountId: string
  pageId: string
  profileUrl?: string
  accessToken: string // masked
  connectedAt: string
}

const PLATFORM_META = {
  FACEBOOK: { label: 'Facebook', icon: Facebook, color: '#1877F2', bg: '#1877F218' },
  INSTAGRAM: { label: 'Instagram', icon: Instagram, color: '#E1306C', bg: '#E1306C18' },
  TIKTOK: { label: 'TikTok', icon: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.17 8.17 0 0 0 4.78 1.52V6.73a4.85 4.85 0 0 1-1.01-.04z"/>
    </svg>
  ), color: '#000000', bg: '#00000012' },
}

export default function AccountsPage() {
  const searchParams = useSearchParams()
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [showAutoImport, setShowAutoImport] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [userToken, setUserToken] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState('')
  const [importError, setImportError] = useState('')
  const googleJustConnected = searchParams.get('google_connected') === '1'
  const googleError = searchParams.get('google_error')
  const fbConnectedParam = searchParams.get('fb_connected') // e.g. "2fb1ig"
  const fbError = searchParams.get('fb_error')
  const canvaJustConnected = searchParams.get('canva') === 'connected'
  const canvaError = searchParams.get('canva') === 'error' ? (searchParams.get('message') || 'unknown_error') : null
  const [canvaAccount, setCanvaAccount] = useState<{ displayName?: string; connectedAt?: string } | null>(null)
  const [loadingCanva, setLoadingCanva] = useState(true)
  const [googleConnected, setGoogleConnected] = useState(googleJustConnected)
  const [gmailAccounts, setGmailAccounts] = useState<{ id: string; email: string; displayName?: string; connectedAt: string }[]>([])
  const [loadingGmail, setLoadingGmail] = useState(true)
  const [manualForm, setManualForm] = useState({
    platform: 'FACEBOOK',
    pageId: '',
    pageName: '',
    accessToken: '',
    profileUrl: '',
  })
  const [saving, setSaving] = useState(false)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState('')
  const [refreshTargetId, setRefreshTargetId] = useState<string | null>(null)

  async function fetchAccounts() {
    setLoading(true)
    const res = await fetch('/api/social/accounts')
    const data = await res.json()
    setAccounts(data.accounts || [])
    setLoading(false)
  }

  useEffect(() => { fetchAccounts() }, [])

  useEffect(() => {
    fetch('/api/canva/disconnect')
      .then((r) => r.json())
      .then((d) => {
        if (d.connected) setCanvaAccount({ displayName: d.displayName, connectedAt: d.connectedAt })
      })
      .finally(() => setLoadingCanva(false))
  }, [])

  useEffect(() => {
    fetch('/api/auth/google/status')
      .then((r) => r.json())
      .then((d) => { if (d.connected) setGoogleConnected(true) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/gmail-accounts')
      .then((r) => r.json())
      .then((d) => setGmailAccounts(d.accounts || []))
      .finally(() => setLoadingGmail(false))
  }, [])

  async function disconnectGmail(id: string, email: string) {
    if (!confirm(`Disconnect ${email}? Campaigns using this account will stop working.`)) return
    await fetch('/api/gmail-accounts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setGmailAccounts((prev) => prev.filter((a) => a.id !== id))
  }

  async function disconnectCanva() {
    if (!confirm('Disconnect Canva? You\'ll need to reconnect to import designs into posts.')) return
    await fetch('/api/canva/disconnect', { method: 'DELETE' })
    setCanvaAccount(null)
  }

  async function handleAutoImport() {
    if (!userToken.trim()) return
    setImporting(true)
    setImportError('')
    setImportResult('')
    try {
      const res = await fetch('/api/social/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAccessToken: userToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setImportResult(data.message)
      setUserToken('')
      setShowAutoImport(false)
      fetchAccounts()
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  async function handleManualAdd() {
    if (!manualForm.pageId || !manualForm.accessToken) return
    setSaving(true)
    try {
      const res = await fetch('/api/social/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualEntry: manualForm }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setManualForm({ platform: 'FACEBOOK', pageId: '', pageName: '', accessToken: '', profileUrl: '' })
      setShowManual(false)
      fetchAccounts()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to connect account')
    } finally {
      setSaving(false)
    }
  }

  async function handleDisconnect(id: string, name: string) {
    if (!confirm(`Disconnect "${name}"? Posts scheduled to this account may fail.`)) return
    await fetch('/api/social/accounts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    fetchAccounts()
  }

  async function handleRefreshToken(account: SocialAccount) {
    if (!refreshToken.trim()) return
    setRefreshingId(account.id)
    try {
      const res = await fetch('/api/social/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manualEntry: {
            platform: account.platform,
            pageId: account.accountId,
            pageName: account.pageName,
            accessToken: refreshToken,
            profileUrl: account.profileUrl,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRefreshToken('')
      setRefreshTargetId(null)
      fetchAccounts()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update token')
    } finally {
      setRefreshingId(null)
    }
  }

  const fbAccounts = accounts.filter((a) => a.platform === 'FACEBOOK')
  const igAccounts = accounts.filter((a) => a.platform === 'INSTAGRAM')

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>
          Settings
        </p>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          Connected Accounts
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
          Connect your Facebook pages and Instagram accounts to enable scheduling.
          You can connect up to all 3 Facebook + 3 Instagram pages.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { label: 'Facebook Pages', count: fbAccounts.length, max: 3, color: '#1877F2', icon: Facebook },
          { label: 'Instagram Accounts', count: igAccounts.length, max: 3, color: '#E1306C', icon: Instagram },
        ].map(({ label, count, max, color, icon: Icon }) => (
          <div key={label} className="rounded-xl p-4 flex items-center gap-4" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}18` }}>
              <Icon size={20} style={{ color }} />
            </div>
            <div>
              <p className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                {count} <span className="text-sm font-normal" style={{ color: 'var(--mid-gray)' }}>/ {max}</span>
              </p>
              <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Facebook OAuth success/error banners */}
      {fbConnectedParam && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>
          <CheckCircle size={16} />
          Facebook &amp; Instagram connected successfully! All your pages have been imported.
        </div>
      )}
      {fbError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm" style={{ background: '#FEE2E2', color: '#DC2626' }}>
          <AlertCircle size={16} />
          {fbError === 'no_pages_found'
            ? 'No Facebook Pages found. Make sure you manage at least one Facebook Page with your account.'
            : fbError === 'You cancelled the Facebook connection.'
            ? 'Connection cancelled.'
            : `Facebook error: ${fbError}`}
        </div>
      )}
      {importResult && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>
          <CheckCircle size={16} />
          {importResult}
        </div>
      )}
      {importError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm" style={{ background: '#FEE2E2', color: '#DC2626' }}>
          <AlertCircle size={16} />
          {importError}
        </div>
      )}

      {/* ── Primary: Connect with Facebook OAuth ── */}
      <div className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#1877F218' }}>
              <Facebook size={20} style={{ color: '#1877F2' }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Connect Facebook &amp; Instagram</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                One click — imports all your Pages and linked Instagram accounts automatically
              </p>
            </div>
          </div>
          <a
            href="/api/social/facebook/auth"
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap"
            style={{ background: '#1877F2', color: '#fff', fontFamily: 'var(--font-display)' }}
          >
            <Facebook size={15} />
            Connect with Facebook
          </a>
        </div>
        <p className="text-xs mt-3 pt-3" style={{ color: 'var(--mid-gray)', borderTop: '1px solid var(--light-gray)' }}>
          You&apos;ll be taken to Facebook to sign in and grant page permissions. All Facebook Pages you manage will be imported, along with any linked Instagram Business accounts. Tokens never expire for Page Access Tokens obtained this way.
        </p>
      </div>

      {/* ── Fallback: Manual token entry ── */}
      <div className="flex gap-3">
        <button
          onClick={() => { setShowManual(!showManual); setShowAutoImport(false) }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold"
          style={{ background: 'var(--light-gray)', color: 'var(--mid-gray)' }}
        >
          <Plus size={13} />
          Add / update token manually
          {showManual ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* Legacy auto-import panel (hidden by default) */}
      {showAutoImport && (
        <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--pale-teal)', border: '1px solid rgba(46,94,90,0.2)' }}>
          <div className="flex gap-2">
            <input
              type="text"
              value={userToken}
              onChange={(e) => setUserToken(e.target.value)}
              placeholder="EAAxxxxxxxx... (User Access Token)"
              className="flex-1 px-3 py-2.5 rounded-lg text-sm outline-none font-mono"
              style={{ border: '1px solid rgba(46,94,90,0.3)', background: '#fff', color: 'var(--charcoal)' }}
            />
            <button
              onClick={handleAutoImport}
              disabled={importing || !userToken.trim()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap"
              style={{ background: 'var(--teal)', color: '#fff' }}
            >
              {importing ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
              {importing ? 'Importing…' : 'Import'}
            </button>
          </div>
          <div className="rounded-lg p-3 text-xs" style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' }}>
            <p className="font-bold mb-0.5">Placeholder kept for legacy reference</p>
          </div>
        </div>
      )}

      {/* Manual add panel */}
      {showManual && (
        <div className="rounded-xl p-5 space-y-4" style={{ background: '#fff', border: '1px solid var(--teal)' }}>
          <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            Add Account Manually
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--mid-gray)' }}>Platform</label>
              <select
                value={manualForm.platform}
                onChange={(e) => setManualForm((f) => ({ ...f, platform: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={{ border: '1.5px solid var(--light-gray)', color: 'var(--charcoal)' }}
              >
                <option value="FACEBOOK">Facebook Page</option>
                <option value="INSTAGRAM">Instagram Business</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--mid-gray)' }}>
                {manualForm.platform === 'FACEBOOK' ? 'Page ID' : 'IG Account ID'}
              </label>
              <input
                type="text"
                value={manualForm.pageId}
                onChange={(e) => setManualForm((f) => ({ ...f, pageId: e.target.value }))}
                placeholder="e.g. 123456789012345"
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none font-mono"
                style={{ border: '1.5px solid var(--light-gray)', color: 'var(--charcoal)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--mid-gray)' }}>
                Page / Account Name
              </label>
              <input
                type="text"
                value={manualForm.pageName}
                onChange={(e) => setManualForm((f) => ({ ...f, pageName: e.target.value }))}
                placeholder="e.g. Sapphire Clinics East"
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={{ border: '1.5px solid var(--light-gray)', color: 'var(--charcoal)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--mid-gray)' }}>Profile URL (optional)</label>
              <input
                type="text"
                value={manualForm.profileUrl}
                onChange={(e) => setManualForm((f) => ({ ...f, profileUrl: e.target.value }))}
                placeholder="https://facebook.com/yourpage"
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={{ border: '1.5px solid var(--light-gray)', color: 'var(--charcoal)' }}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--mid-gray)' }}>Page Access Token</label>
              <input
                type="text"
                value={manualForm.accessToken}
                onChange={(e) => setManualForm((f) => ({ ...f, accessToken: e.target.value }))}
                placeholder="EAAxxxxxxxx... (Page Access Token)"
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none font-mono"
                style={{ border: '1.5px solid var(--light-gray)', color: 'var(--charcoal)' }}
              />
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowManual(false)} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--light-gray)', color: 'var(--charcoal)' }}>Cancel</button>
            <button
              onClick={handleManualAdd}
              disabled={saving || !manualForm.pageId || !manualForm.accessToken}
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: 'var(--teal)', color: '#fff' }}
            >
              {saving ? 'Connecting…' : 'Connect Account'}
            </button>
          </div>
        </div>
      )}

      {/* Connected accounts list */}
      {loading ? (
        <div className="text-sm text-center py-8" style={{ color: 'var(--mid-gray)' }}>Loading accounts…</div>
      ) : accounts.length === 0 ? (
        <div
          className="rounded-xl p-10 flex flex-col items-center text-center"
          style={{ background: '#fff', border: '2px dashed var(--light-gray)' }}
        >
          <Facebook size={36} className="mb-3" style={{ color: 'var(--light-gray)' }} />
          <p className="font-semibold mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>No accounts connected</p>
          <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>
            Use the Auto-Import button above to connect all your Facebook pages and Instagram accounts at once.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map((account) => {
            const meta = PLATFORM_META[account.platform]
            const Icon = meta.icon
            const isRefreshTarget = refreshTargetId === account.id
            return (
              <div
                key={account.id}
                className="rounded-xl overflow-hidden"
                style={{ background: '#fff', border: '1px solid var(--light-gray)' }}
              >
                <div className="p-4 flex items-center gap-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: meta.bg }}
                  >
                    <Icon size={20} style={{ color: meta.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>
                        {account.pageName || account.accountId}
                      </p>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: meta.bg, color: meta.color }}
                      >
                        {meta.label}
                      </span>
                      <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--teal)' }}>
                        <CheckCircle size={11} />
                        Connected
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <p className="text-xs font-mono" style={{ color: 'var(--mid-gray)' }}>
                        ID: {account.accountId} · Token: {account.accessToken}
                      </p>
                      {account.profileUrl && (
                        <a href={account.profileUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--teal)' }}>
                          <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => {
                        setRefreshTargetId(isRefreshTarget ? null : account.id)
                        setRefreshToken('')
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                      style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' }}
                      title="Refresh expired token"
                    >
                      <KeyRound size={12} />
                      Refresh Token
                    </button>
                    <button
                      onClick={() => handleDisconnect(account.id, account.pageName)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-red-50"
                      style={{ color: '#DC2626' }}
                    >
                      <Trash2 size={13} />
                      Disconnect
                    </button>
                  </div>
                </div>

                {/* Inline refresh token form */}
                {isRefreshTarget && (
                  <div className="px-4 pb-4 pt-0">
                    <div className="rounded-lg p-3 space-y-2" style={{ background: '#FEF3C7', border: '1px solid #FCD34D' }}>
                      <p className="text-xs font-semibold" style={{ color: '#92400E' }}>
                        Paste a new Page Access Token for <strong>{account.pageName}</strong>
                      </p>
                      <p className="text-xs" style={{ color: '#92400E' }}>
                        In Graph API Explorer → select your Meta App → at top-right dropdown, switch from &ldquo;User Token&rdquo; to <strong>&ldquo;{account.pageName}&rdquo;</strong> under Page Access Tokens → copy that token.
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={refreshToken}
                          onChange={(e) => setRefreshToken(e.target.value)}
                          placeholder="EAAxxxxxxxx... (Page Access Token)"
                          className="flex-1 px-3 py-2 rounded-lg text-xs outline-none font-mono"
                          style={{ border: '1px solid #FCD34D', background: '#fff', color: 'var(--charcoal)' }}
                        />
                        <button
                          onClick={() => handleRefreshToken(account)}
                          disabled={!refreshToken.trim() || refreshingId === account.id}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap"
                          style={{ background: 'var(--teal)', color: '#fff' }}
                        >
                          {refreshingId === account.id ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                          {refreshingId === account.id ? 'Saving…' : 'Save Token'}
                        </button>
                        <button
                          onClick={() => { setRefreshTargetId(null); setRefreshToken('') }}
                          className="px-3 py-2 rounded-lg text-xs"
                          style={{ background: 'var(--light-gray)', color: 'var(--charcoal)' }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Gmail Accounts ────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-base font-bold mb-3" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          Gmail Accounts (Email Campaigns)
        </h2>

        {googleJustConnected && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm mb-3" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>
            <CheckCircle size={16} />
            Gmail account connected successfully!
          </div>
        )}
        {googleError && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm mb-3" style={{ background: '#FEE2E2', color: '#DC2626' }}>
            <AlertCircle size={16} />
            {googleError === 'no_refresh_token'
              ? 'No refresh token returned. Please revoke app access in your Google account and try again.'
              : `Connection failed: ${googleError}`}
          </div>
        )}

        {/* Connected Gmail accounts list */}
        {!loadingGmail && gmailAccounts.length > 0 && (
          <div className="space-y-2 mb-3">
            {gmailAccounts.map((acct) => (
              <div key={acct.id} className="rounded-xl p-4 flex items-center gap-4" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#EA433518' }}>
                  <Mail size={20} style={{ color: '#EA4335' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>
                    {acct.displayName && acct.displayName !== acct.email ? acct.displayName : acct.email}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                    {acct.email} · Connected {new Date(acct.connectedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <span className="flex items-center gap-1 text-xs mr-2" style={{ color: 'var(--teal)' }}>
                  <CheckCircle size={11} />
                  Active
                </span>
                <button
                  onClick={() => disconnectGmail(acct.id, acct.email)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-red-50"
                  style={{ color: '#DC2626' }}
                >
                  <Trash2 size={13} />
                  Disconnect
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-xl p-5 flex items-center gap-4" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#EA433518' }}>
            <Mail size={20} style={{ color: '#EA4335' }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>
              {gmailAccounts.length > 0 ? 'Add Another Gmail Account' : 'Connect Gmail / Google Workspace'}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
              {gmailAccounts.length > 0
                ? `${gmailAccounts.length} account${gmailAccounts.length > 1 ? 's' : ''} connected · Add more to send from different addresses`
                : 'Used to send email campaigns to patients. You can connect multiple accounts.'}
            </p>
          </div>
          <a
            href="/api/auth/google"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap"
            style={{ background: 'var(--teal)', color: '#fff' }}
          >
            <Plus size={14} />
            {gmailAccounts.length > 0 ? 'Add Account' : 'Connect Gmail'}
          </a>
        </div>
        <p className="text-xs mt-2 px-1" style={{ color: 'var(--mid-gray)' }}>
          You&apos;ll be redirected to Google to sign in. Make sure <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> are set in your <code>.env</code> file.
        </p>
      </div>

      {/* ── Canva ──────────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-base font-bold mb-3" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          Canva (Design Import)
        </h2>

        {canvaJustConnected && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm mb-3" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>
            <CheckCircle size={16} />
            Canva connected! You can now import designs directly into posts and templates.
          </div>
        )}
        {canvaError && (
          <div className="px-4 py-3 rounded-lg text-sm mb-3" style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
            <div className="flex items-center gap-2 font-semibold mb-1">
              <AlertCircle size={16} />
              Canva connection failed: <code className="text-xs">{canvaError}</code>
            </div>
            <p className="text-xs ml-6">
              This usually means the <strong>redirect URL is not set</strong> in your Canva integration.
              Go to <a href="https://www.canva.com/developers" target="_blank" rel="noreferrer" className="underline font-semibold">developers.canva.com</a> →
              Your integrations → click your integration → <strong>set the Redirect URL</strong> to{' '}
              <code className="bg-red-100 px-1 rounded">https://marketing.sapphireclinicseast.org/api/canva/callback</code>
            </p>
          </div>
        )}

        <div className="rounded-xl p-5 flex items-center gap-4" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white font-bold text-lg"
            style={{ background: '#7B2FBE' }}
          >
            C
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Canva</p>
            {loadingCanva ? (
              <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>Checking connection…</p>
            ) : canvaAccount ? (
              <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                Connected{canvaAccount.displayName ? ` as ${canvaAccount.displayName}` : ''} · Import designs in Post Composer &amp; Templates
              </p>
            ) : (
              <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                Connect to import Canva designs directly into posts and birthday / holiday templates.
              </p>
            )}
          </div>
          {!loadingCanva && (
            canvaAccount ? (
              <button
                onClick={disconnectCanva}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ background: '#FEE2E2', color: '#DC2626' }}
              >
                <Trash2 size={14} />
                Disconnect
              </button>
            ) : (
              <a
                href="/api/canva/auth"
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ background: '#7B2FBE', color: '#fff' }}
              >
                <ExternalLink size={14} />
                Connect Canva
              </a>
            )
          )}
        </div>
        <p className="text-xs mt-2 px-1" style={{ color: 'var(--mid-gray)' }}>
          Make sure <code>CANVA_CLIENT_ID</code> and <code>CANVA_CLIENT_SECRET</code> are set in your <code>.env</code> file.
          Once connected, use the <strong>&ldquo;Import from Canva&rdquo;</strong> button when composing posts or generating templates.
        </p>
      </div>
    </div>
  )
}
