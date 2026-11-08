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
  ChevronDown,
  ChevronUp,
  ExternalLink,
  RefreshCw,
  Mail,
  KeyRound,
  Building2,
  Palette,
  X,
} from 'lucide-react'
import { branchLabel } from '@/lib/branch-label'
import { CARD_STYLE, KpiCard, Skeleton, EmptyState } from '../../patients/dashboard/ui'
import {
  SettingsHeader, GroupLabel, StatusPill, ProviderTile, ProviderCard, Banner,
  CONTROL, CONTROL_STYLE, LABEL, BTN_PRIMARY, BTN_SECONDARY, BTN_SM, BTN_DANGER_GHOST, DANGER, SUBTLE_BG, TH,
  fmtDate, relTime,
} from '../ui'

interface SocialAccount {
  id: string
  platform: 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK'
  pageName: string
  accountId: string
  pageId: string
  profileUrl?: string
  accessToken: string // masked
  connectedAt: string
  /** Sent by GET /api/social/accounts (Prisma @updatedAt); display only. */
  updatedAt?: string
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

const FB_BLUE = '#1877F2'
const IG_PINK = '#E1306C'
const GMAIL_RED = '#EA4335'
const CANVA_PURPLE = '#7B2FBE'
const AMBER = { bg: '#FFFBEB', fg: '#92400E', border: '#FDE68A' }

/** Placeholder KPI tile while its source loads. */
function KpiSkeleton() {
  return (
    <div className="rounded-xl px-4 py-3.5" style={CARD_STYLE} aria-hidden>
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-7 w-14 mt-2" />
      <Skeleton className="h-3 w-24 mt-2" />
    </div>
  )
}

/** Placeholder rows inside a provider card while its list loads. */
function RowsSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-3.5" style={{ borderTop: i ? '1px solid var(--light-gray)' : undefined }}>
          <Skeleton className="w-8 h-8 rounded-lg" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-3.5" style={{ width: `${55 - i * 10}%` }} />
            <Skeleton className="h-2.5" style={{ width: `${40 - i * 8}%` }} />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
      ))}
    </div>
  )
}

export default function AccountsPage() {
  const searchParams = useSearchParams()
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [loading, setLoading] = useState(true)
  // Display only: a failed list load used to leave "Loading accounts…" up forever.
  const [accountsError, setAccountsError] = useState('')
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
  // Display only: GET /api/canva/disconnect reports connected=false with a
  // connectedAt when a Canva row exists but its token could not be refreshed.
  const [canvaStale, setCanvaStale] = useState(false)
  const [canvaCheckFailed, setCanvaCheckFailed] = useState(false)
  const [googleConnected, setGoogleConnected] = useState(googleJustConnected)
  const [gmailAccounts, setGmailAccounts] = useState<{ id: string; email: string; displayName?: string; connectedAt: string }[]>([])
  const [loadingGmail, setLoadingGmail] = useState(true)
  const [gmailError, setGmailError] = useState(false)
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
  const [syncingNames, setSyncingNames] = useState(false)
  const [syncResult, setSyncResult] = useState('')

  async function fetchAccounts() {
    setLoading(true)
    setAccountsError('')
    try {
      const res = await fetch('/api/social/accounts')
      const data = await res.json()
      if (!res.ok) setAccountsError(data.error || `Server error (HTTP ${res.status})`)
      setAccounts(data.accounts || [])
    } catch (err) {
      setAccountsError(err instanceof Error ? err.message : 'Could not load accounts')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAccounts() }, [])

  useEffect(() => {
    fetch('/api/canva/disconnect')
      .then((r) => r.json())
      .then((d) => {
        if (d.connected) setCanvaAccount({ displayName: d.displayName, connectedAt: d.connectedAt })
        else if (d.connectedAt) setCanvaStale(true)
      })
      .catch(() => setCanvaCheckFailed(true))
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
      .catch(() => setGmailError(true))
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

  async function handleSyncNames() {
    setSyncingNames(true)
    setSyncResult('')
    try {
      const res = await fetch('/api/social/accounts', { method: 'PATCH' })
      const data = await res.json()
      setSyncResult(data.updated > 0 ? `Updated ${data.updated} name(s)` : 'All names are already up to date')
      fetchAccounts()
    } catch {
      setSyncResult('Sync failed — check account tokens')
    } finally {
      setSyncingNames(false)
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
  const socialInitial = loading && accounts.length === 0

  const metaStatus = socialInitial
    ? <StatusPill tone="checking">Checking…</StatusPill>
    : accountsError
      ? <StatusPill tone="error">Error</StatusPill>
      : accounts.length > 0
        ? <StatusPill tone="connected">Connected · {accounts.length}</StatusPill>
        : <StatusPill tone="off">Not connected</StatusPill>

  const gmailStatus = loadingGmail
    ? <StatusPill tone="checking">Checking…</StatusPill>
    : gmailError
      ? <StatusPill tone="error">Error</StatusPill>
      : gmailAccounts.length > 0
        ? <StatusPill tone="connected">Connected · {gmailAccounts.length}</StatusPill>
        : <StatusPill tone="off">Not connected</StatusPill>

  const canvaStatus = loadingCanva
    ? <StatusPill tone="checking">Checking…</StatusPill>
    : canvaAccount
      ? <StatusPill tone="connected">Connected</StatusPill>
      : canvaStale
        ? <StatusPill tone="expired" title="A Canva account is saved but its access could not be refreshed. Connect again.">Expired</StatusPill>
        : canvaCheckFailed
          ? <StatusPill tone="error" title="Could not check the Canva connection">Error</StatusPill>
          : <StatusPill tone="off">Not connected</StatusPill>

  return (
    <div className="max-w-[1100px] mx-auto space-y-6 min-w-0">
      <SettingsHeader
        title="Connected Accounts"
        subtitle={<>Connect your Facebook pages and Instagram accounts to enable scheduling — up to 3 Facebook + 3 Instagram pages — plus the Gmail senders and Canva account the hub uses.</>}
        actions={accounts.length > 0 ? (
          <button
            onClick={handleSyncNames}
            disabled={syncingNames}
            className={BTN_SECONDARY}
            style={CONTROL_STYLE}
            title="Re-read page names from Facebook"
          >
            <RefreshCw size={14} className={syncingNames ? 'animate-spin' : ''} style={{ color: 'var(--teal)' }} />
            {syncingNames ? 'Syncing…' : 'Sync Names from Facebook'}
          </button>
        ) : undefined}
      />

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {socialInitial ? <><KpiSkeleton /><KpiSkeleton /></> : (
          <>
            <KpiCard label="Facebook Pages" icon={<Facebook size={16} />} accent={FB_BLUE}
              value={<>{fbAccounts.length} <span className="text-sm font-normal" style={{ color: 'var(--mid-gray)' }}>/ 3</span></>}
              sub={fbAccounts.length >= 3 ? 'All slots used' : `${3 - fbAccounts.length} slot${3 - fbAccounts.length === 1 ? '' : 's'} free`} />
            <KpiCard label="Instagram Accounts" icon={<Instagram size={16} />} accent={IG_PINK}
              value={<>{igAccounts.length} <span className="text-sm font-normal" style={{ color: 'var(--mid-gray)' }}>/ 3</span></>}
              sub={igAccounts.length >= 3 ? 'All slots used' : `${3 - igAccounts.length} slot${3 - igAccounts.length === 1 ? '' : 's'} free`} />
          </>
        )}
        {loadingGmail ? <KpiSkeleton /> : (
          <KpiCard label="Gmail Senders" icon={<Mail size={16} />} accent={GMAIL_RED}
            value={gmailError ? '—' : gmailAccounts.length}
            sub={gmailError ? 'Could not load' : gmailAccounts.length ? 'For email campaigns' : 'None connected'} />
        )}
        {loadingCanva ? <KpiSkeleton /> : (
          <KpiCard label="Canva" icon={<Palette size={16} />} accent={CANVA_PURPLE}
            value={<span className="text-lg">{canvaAccount ? 'Connected' : canvaStale ? 'Expired' : 'Off'}</span>}
            sub={canvaAccount?.displayName ? `as ${canvaAccount.displayName}` : canvaAccount ? 'Design import on' : 'Design import off'} />
        )}
      </div>

      {/* ── OAuth / import results ── */}
      {(fbConnectedParam || fbError || importResult || importError) && (
        <div className="space-y-2">
          {fbConnectedParam && (
            <Banner tone="success">Facebook &amp; Instagram connected successfully! All your pages have been imported.</Banner>
          )}
          {fbError && (
            <Banner tone="error">
              {fbError === 'no_pages_found'
                ? 'No Facebook Pages found. Make sure you manage at least one Facebook Page with your account.'
                : fbError === 'You cancelled the Facebook connection.'
                ? 'Connection cancelled.'
                : `Facebook error: ${fbError}`}
            </Banner>
          )}
          {importResult && <Banner tone="success">{importResult}</Banner>}
          {importError && <Banner tone="error">{importError}</Banner>}
        </div>
      )}

      {/* ═════ Social media ═════ */}
      <div className="space-y-3">
        <GroupLabel hint="Scheduling and publishing posts">Social media</GroupLabel>

        {syncResult && <Banner tone="info">{syncResult}</Banner>}
        {accountsError && (
          <Banner tone="error" onRetry={fetchAccounts}>
            <strong>Couldn&rsquo;t load connected social accounts.</strong> {accountsError}
          </Banner>
        )}

        <ProviderCard
          tile={<ProviderTile color={FB_BLUE}><Facebook size={20} /></ProviderTile>}
          name="Facebook & Instagram"
          description="One click — imports all your Pages and linked Instagram accounts automatically"
          status={metaStatus}
          actions={
            <>
              <button
                onClick={() => { setShowManual(!showManual); setShowAutoImport(false) }}
                className={BTN_SECONDARY}
                style={{ ...CONTROL_STYLE, color: 'var(--mid-gray)' }}
                aria-expanded={showManual}
              >
                <Plus size={13} />
                Add / update token manually
                {showManual ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              <a
                href="/api/social/facebook/auth"
                className={BTN_PRIMARY}
                style={{ background: FB_BLUE, fontFamily: 'var(--font-display)' }}
              >
                <Facebook size={15} />
                Connect with Facebook
              </a>
            </>
          }
          footer={<>You&apos;ll be taken to Facebook to sign in and grant page permissions. All Facebook Pages you manage will be imported, along with any linked Instagram Business accounts. Tokens never expire for Page Access Tokens obtained this way.</>}
        >
          {/* Legacy auto-import panel (hidden by default) */}
          {showAutoImport && (
            <div className="px-5 py-4 space-y-3" style={{ background: 'var(--pale-teal)', borderBottom: '1px solid var(--light-gray)' }}>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={userToken}
                  onChange={(e) => setUserToken(e.target.value)}
                  placeholder="EAAxxxxxxxx... (User Access Token)"
                  className={`${CONTROL} flex-1 min-w-[220px] font-mono`}
                  style={CONTROL_STYLE}
                />
                <button
                  onClick={handleAutoImport}
                  disabled={importing || !userToken.trim()}
                  className={BTN_PRIMARY}
                  style={{ background: 'var(--teal)' }}
                >
                  {importing ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
                  {importing ? 'Importing…' : 'Import'}
                </button>
              </div>
              <div className="rounded-lg px-3 py-2 text-xs" style={{ background: AMBER.bg, color: AMBER.fg, border: `1px solid ${AMBER.border}` }}>
                <p className="font-bold">Placeholder kept for legacy reference</p>
              </div>
            </div>
          )}

          {/* Manual add panel */}
          {showManual && (
            <div className="px-5 py-4 space-y-4" style={{ background: SUBTLE_BG, borderBottom: '1px solid var(--light-gray)' }}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                  Add Account Manually
                </p>
                <button onClick={() => setShowManual(false)} aria-label="Close manual entry"
                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg hover:bg-black/[0.05]" style={{ color: 'var(--mid-gray)' }}>
                  <X size={14} />
                </button>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="min-w-0">
                  <label className={LABEL} style={{ color: 'var(--mid-gray)' }}>Platform</label>
                  <select
                    value={manualForm.platform}
                    onChange={(e) => setManualForm((f) => ({ ...f, platform: e.target.value }))}
                    className={CONTROL}
                    style={CONTROL_STYLE}
                  >
                    <option value="FACEBOOK">Facebook Page</option>
                    <option value="INSTAGRAM">Instagram Business</option>
                  </select>
                </div>
                <div className="min-w-0">
                  <label className={LABEL} style={{ color: 'var(--mid-gray)' }}>
                    {manualForm.platform === 'FACEBOOK' ? 'Page ID' : 'IG Account ID'}
                  </label>
                  <input
                    type="text"
                    value={manualForm.pageId}
                    onChange={(e) => setManualForm((f) => ({ ...f, pageId: e.target.value }))}
                    placeholder="e.g. 123456789012345"
                    className={`${CONTROL} font-mono`}
                    style={CONTROL_STYLE}
                  />
                </div>
                <div className="min-w-0">
                  <label className={LABEL} style={{ color: 'var(--mid-gray)' }}>
                    Page / Account Name
                  </label>
                  <input
                    type="text"
                    value={manualForm.pageName}
                    onChange={(e) => setManualForm((f) => ({ ...f, pageName: e.target.value }))}
                    placeholder="e.g. Sapphire Clinics East"
                    className={CONTROL}
                    style={CONTROL_STYLE}
                  />
                </div>
                <div className="min-w-0">
                  <label className={LABEL} style={{ color: 'var(--mid-gray)' }}>Profile URL (optional)</label>
                  <input
                    type="text"
                    value={manualForm.profileUrl}
                    onChange={(e) => setManualForm((f) => ({ ...f, profileUrl: e.target.value }))}
                    placeholder="https://facebook.com/yourpage"
                    className={CONTROL}
                    style={CONTROL_STYLE}
                  />
                </div>
                <div className="sm:col-span-2 min-w-0">
                  <label className={LABEL} style={{ color: 'var(--mid-gray)' }}>Page Access Token</label>
                  <input
                    type="text"
                    value={manualForm.accessToken}
                    onChange={(e) => setManualForm((f) => ({ ...f, accessToken: e.target.value }))}
                    placeholder="EAAxxxxxxxx... (Page Access Token)"
                    className={`${CONTROL} font-mono`}
                    style={CONTROL_STYLE}
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowManual(false)} className={BTN_SECONDARY} style={CONTROL_STYLE}>Cancel</button>
                <button
                  onClick={handleManualAdd}
                  disabled={saving || !manualForm.pageId || !manualForm.accessToken}
                  className={BTN_PRIMARY}
                  style={{ background: 'var(--teal)' }}
                >
                  {saving ? 'Connecting…' : 'Connect Account'}
                </button>
              </div>
            </div>
          )}

          {/* Connected accounts list */}
          {socialInitial ? (
            <RowsSkeleton rows={3} />
          ) : accounts.length === 0 ? (
            accountsError ? null : (
              <div className="flex flex-col items-center">
                <Facebook size={26} className="mt-10 -mb-8" style={{ color: 'var(--light-gray)' }} />
                <EmptyState
                  title="No accounts connected"
                  hint="Use Connect with Facebook above to connect all your Facebook pages and Instagram accounts at once." />
              </div>
            )
          ) : (
            <ul>
              {accounts.map((account, i) => {
                const meta = PLATFORM_META[account.platform]
                const Icon = meta.icon
                const isRefreshTarget = refreshTargetId === account.id
                return (
                  <li key={account.id} style={{ borderTop: i ? '1px solid var(--light-gray)' : undefined }}>
                    <div className="px-5 py-3.5 flex flex-wrap items-center gap-x-4 gap-y-2.5">
                      <ProviderTile color={meta.color} bg={meta.bg} size={36}>
                        <Icon size={18} style={{ color: meta.color }} />
                      </ProviderTile>
                      <div className="flex-1 min-w-[220px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold truncate" style={{ color: 'var(--charcoal)' }}>
                            {account.pageName || account.accountId}
                          </p>
                          <span
                            className="text-[11px] px-2 py-0.5 rounded-full font-semibold leading-4"
                            style={{ background: meta.bg, color: meta.color }}
                          >
                            {meta.label}
                          </span>
                          <StatusPill tone="connected">Connected</StatusPill>
                          {account.profileUrl && (
                            <a href={account.profileUrl} target="_blank" rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-semibold hover:underline" style={{ color: 'var(--teal)' }}>
                              <ExternalLink size={11} /> Profile
                            </a>
                          )}
                        </div>
                        <p className="text-[11.5px] font-mono mt-1 truncate" style={{ color: 'var(--mid-gray)' }}>
                          ID: {account.accountId} · Token: {account.accessToken}
                        </p>
                        {(account.connectedAt || account.updatedAt) && (
                          <p className="text-[11px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                            {account.connectedAt && <>Connected {fmtDate(account.connectedAt)}</>}
                            {account.updatedAt && <> · Last updated {relTime(account.updatedAt)}</>}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => {
                            setRefreshTargetId(isRefreshTarget ? null : account.id)
                            setRefreshToken('')
                          }}
                          className={`${BTN_SM} hover:opacity-90`}
                          style={{ background: AMBER.bg, color: AMBER.fg, border: `1px solid ${AMBER.border}` }}
                          title="Refresh expired token"
                          aria-expanded={isRefreshTarget}
                        >
                          <KeyRound size={12} />
                          Refresh Token
                        </button>
                        <button
                          onClick={() => handleDisconnect(account.id, account.pageName)}
                          className={BTN_DANGER_GHOST}
                          style={{ color: DANGER }}
                        >
                          <Trash2 size={13} />
                          Disconnect
                        </button>
                      </div>
                    </div>

                    {/* Inline refresh token form */}
                    {isRefreshTarget && (
                      <div className="px-5 pb-4">
                        <div className="rounded-lg p-3 space-y-2" style={{ background: AMBER.bg, border: `1px solid ${AMBER.border}` }}>
                          <p className="text-xs font-semibold" style={{ color: AMBER.fg }}>
                            Paste a new Page Access Token for <strong>{account.pageName}</strong>
                          </p>
                          <p className="text-xs leading-relaxed" style={{ color: AMBER.fg }}>
                            In Graph API Explorer → select your Meta App → at top-right dropdown, switch from &ldquo;User Token&rdquo; to <strong>&ldquo;{account.pageName}&rdquo;</strong> under Page Access Tokens → copy that token.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <input
                              type="text"
                              value={refreshToken}
                              onChange={(e) => setRefreshToken(e.target.value)}
                              placeholder="EAAxxxxxxxx... (Page Access Token)"
                              className="flex-1 min-w-[220px] h-8 px-3 rounded-lg text-xs outline-none font-mono"
                              style={{ border: `1px solid ${AMBER.border}`, background: '#fff', color: 'var(--charcoal)' }}
                            />
                            <button
                              onClick={() => handleRefreshToken(account)}
                              disabled={!refreshToken.trim() || refreshingId === account.id}
                              className={`${BTN_SM} text-white hover:opacity-90`}
                              style={{ background: 'var(--teal)' }}
                            >
                              {refreshingId === account.id ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                              {refreshingId === account.id ? 'Saving…' : 'Save Token'}
                            </button>
                            <button
                              onClick={() => { setRefreshTargetId(null); setRefreshToken('') }}
                              className={`${BTN_SM} hover:bg-gray-50`}
                              style={CONTROL_STYLE}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </ProviderCard>
      </div>

      {/* ═════ Email + Design ═════ */}
      <div className="grid lg:grid-cols-2 gap-6 items-start">
        {/* ── Gmail Accounts ── */}
        <div className="space-y-3 min-w-0">
          <GroupLabel hint="Email campaigns">Email</GroupLabel>

          {googleJustConnected && <Banner tone="success">Gmail account connected successfully!</Banner>}
          {googleError && (
            <Banner tone="error">
              {googleError === 'no_refresh_token'
                ? 'No refresh token returned. Please revoke app access in your Google account and try again.'
                : `Connection failed: ${googleError}`}
            </Banner>
          )}
          {gmailError && <Banner tone="error">Couldn&rsquo;t load connected Gmail accounts. Reload the page to try again.</Banner>}

          <ProviderCard
            tile={<ProviderTile color={GMAIL_RED}><Mail size={20} /></ProviderTile>}
            name="Gmail / Google Workspace"
            description={gmailAccounts.length > 0
              ? `${gmailAccounts.length} account${gmailAccounts.length > 1 ? 's' : ''} connected · Add more to send from different addresses`
              : 'Used to send email campaigns to patients. You can connect multiple accounts.'}
            status={gmailStatus}
            actions={
              <a
                href="/api/auth/google"
                className={BTN_PRIMARY}
                style={{ background: 'var(--teal)' }}
              >
                <Plus size={14} />
                {gmailAccounts.length > 0 ? 'Add Account' : 'Connect Gmail'}
              </a>
            }
            footer={<>You&apos;ll be redirected to Google to sign in. Make sure <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> are set in your <code>.env</code> file.</>}
          >
            {loadingGmail ? (
              <RowsSkeleton rows={2} />
            ) : gmailAccounts.length > 0 ? (
              <ul>
                {gmailAccounts.map((acct, i) => (
                  <li key={acct.id} className="px-5 py-3 flex flex-wrap items-center gap-x-3 gap-y-2"
                    style={{ borderTop: i ? '1px solid var(--light-gray)' : undefined }}>
                    <ProviderTile color={GMAIL_RED} size={32}><Mail size={15} /></ProviderTile>
                    <div className="flex-1 min-w-[160px]">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--charcoal)' }}>
                        {acct.displayName && acct.displayName !== acct.email ? acct.displayName : acct.email}
                      </p>
                      <p className="text-[11.5px] truncate" style={{ color: 'var(--mid-gray)' }}>
                        {acct.email} · Connected {new Date(acct.connectedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <StatusPill tone="connected">Active</StatusPill>
                    <button
                      onClick={() => disconnectGmail(acct.id, acct.email)}
                      className={BTN_DANGER_GHOST}
                      style={{ color: DANGER }}
                    >
                      <Trash2 size={13} />
                      Disconnect
                    </button>
                  </li>
                ))}
              </ul>
            ) : gmailError ? null : (
              <p className="px-5 py-4 text-xs" style={{ color: 'var(--mid-gray)' }}>
                No Gmail accounts connected yet.
              </p>
            )}
          </ProviderCard>
        </div>

        {/* ── Canva ── */}
        <div className="space-y-3 min-w-0">
          <GroupLabel hint="Design import">Design</GroupLabel>

          {canvaJustConnected && (
            <Banner tone="success">Canva connected! You can now import designs directly into posts and templates.</Banner>
          )}
          {canvaError && (
            <Banner tone="error">
              <p className="font-semibold">
                Canva connection failed: <code className="text-xs">{canvaError}</code>
              </p>
              <p className="text-xs mt-1">
                This usually means the <strong>redirect URL is not set</strong> in your Canva integration.
                Go to <a href="https://www.canva.com/developers" target="_blank" rel="noreferrer" className="underline font-semibold">developers.canva.com</a> →
                Your integrations → click your integration → <strong>set the Redirect URL</strong> to{' '}
                <code className="bg-red-100 px-1 rounded break-all">https://operations.sapphireclinicseast.org/api/canva/callback</code>
              </p>
            </Banner>
          )}

          <ProviderCard
            tile={
              <span aria-hidden className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white font-bold text-lg"
                style={{ background: CANVA_PURPLE }}>
                C
              </span>
            }
            name="Canva"
            description={loadingCanva
              ? 'Checking connection…'
              : canvaAccount
                ? <>Connected{canvaAccount.displayName ? ` as ${canvaAccount.displayName}` : ''} · Import designs in Post Composer &amp; Templates</>
                : 'Connect to import Canva designs directly into posts and birthday / holiday templates.'}
            status={canvaStatus}
            actions={!loadingCanva ? (
              canvaAccount ? (
                <button
                  onClick={disconnectCanva}
                  className={BTN_SECONDARY}
                  style={{ ...CONTROL_STYLE, color: DANGER, borderColor: '#FECACA' }}
                >
                  <Trash2 size={14} />
                  Disconnect
                </button>
              ) : (
                <a
                  href="/api/canva/auth"
                  className={BTN_PRIMARY}
                  style={{ background: CANVA_PURPLE }}
                >
                  <ExternalLink size={14} />
                  Connect Canva
                </a>
              )
            ) : <Skeleton className="h-9 w-32" />}
            footer={<>Make sure <code>CANVA_CLIENT_ID</code> and <code>CANVA_CLIENT_SECRET</code> are set in your <code>.env</code> file. Once connected, use the <strong>&ldquo;Import from Canva&rdquo;</strong> button when composing posts or generating templates.</>}
          >
            {canvaAccount && (canvaAccount.displayName || canvaAccount.connectedAt) ? (
              <dl className="px-5 py-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {canvaAccount.displayName && (
                  <div className="min-w-0">
                    <dt className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>Connected as</dt>
                    <dd className="mt-0.5 font-semibold truncate" style={{ color: 'var(--charcoal)' }}>{canvaAccount.displayName}</dd>
                  </div>
                )}
                {canvaAccount.connectedAt && (
                  <div className="min-w-0">
                    <dt className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>Since</dt>
                    <dd className="mt-0.5 font-semibold" style={{ color: 'var(--charcoal)' }}>{fmtDate(canvaAccount.connectedAt)}</dd>
                  </div>
                )}
              </dl>
            ) : null}
          </ProviderCard>
        </div>
      </div>

      {/* ═════ Branches & email routing ═════ */}
      <div className="space-y-3">
        <GroupLabel hint="Synced from HR Platform and admin-only routing">Branches &amp; email routing</GroupLabel>

        {/* ─── HR Branches Registry sync ───────────────────────────── */}
        <HrBranchesSection />

        {/* ─── Branch CC Emails (super admin only) ─────────────────── */}
        <BranchCCEmailsSection />
      </div>
    </div>
  )
}

// ── HR Branches Registry sync ───────────────────────────────────────────────
// HR Platform is the source of truth for branch identity/contact config.
// This pulls a local cache via POST /api/branches/sync — same pattern as
// the Staff module's "Sync Staff" button — and shows what's currently
// cached so an admin can confirm the pipe is working without needing to
// log into HR Platform.

interface HrBranchRow {
  id: string
  shortCode: string
  name: string
  brandName: string | null
  emailMain: string | null
  active: boolean
  syncedAt: string
}

function HrBranchesSection() {
  const [branches, setBranches] = useState<HrBranchRow[]>([])
  const [loading, setLoading] = useState(true)
  // Display only: a failed load used to look like "No branches synced yet".
  const [loadError, setLoadError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ synced: number; created: number; updated: number; deleted: number; total: number } | null>(null)

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      const r = await fetch('/api/public/branches?includeInactive=1')
      const d = await r.json()
      setBranches(d.branches || [])
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load branches')
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/branches/sync', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setSyncResult(data)
        load()
      } else {
        alert('Sync failed: ' + (data.error || 'Unknown error') + ' (HTTP ' + res.status + ')')
      }
    } catch (err) {
      alert('Sync failed: ' + (err instanceof Error ? err.message : String(err)))
    }
    setSyncing(false)
  }

  const lastSynced = branches.reduce<string | null>((max, b) => (!max || b.syncedAt > max ? b.syncedAt : max), null)
  const activeCount = branches.filter(b => b.active).length
  const initial = loading && branches.length === 0

  return (
    <ProviderCard
      tile={<ProviderTile color="#1A7B8A" bg="#EAF6F4"><Building2 size={18} /></ProviderTile>}
      name="Branches Registry"
      description="Synced from HR Platform, the single source of truth for branch name/address/emails/hours. Edit branches there, not here."
      status={initial
        ? <StatusPill tone="checking">Checking…</StatusPill>
        : loadError
          ? <StatusPill tone="error">Error</StatusPill>
          : branches.length
            ? <StatusPill tone="connected" title={lastSynced ? `Last synced ${new Date(lastSynced).toLocaleString()}` : undefined}>
                {activeCount} active{lastSynced ? ` · synced ${relTime(lastSynced)}` : ''}
              </StatusPill>
            : <StatusPill tone="off">Not synced</StatusPill>}
      actions={
        <button
          onClick={handleSync}
          disabled={syncing}
          className={BTN_PRIMARY}
          style={{ background: 'var(--teal)', cursor: syncing ? 'not-allowed' : 'pointer' }}
        >
          <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing…' : 'Sync Branches'}
        </button>
      }
    >
      {(syncResult || loadError) && (
        <div className="px-5 pt-3 space-y-2">
          {syncResult && (
            <Banner tone="success">
              Synced {syncResult.synced} of {syncResult.total} ({syncResult.created} new, {syncResult.updated} updated, {syncResult.deleted} removed).
            </Banner>
          )}
          {loadError && (
            <Banner tone="error" onRetry={load}><strong>Couldn&rsquo;t load the branch registry.</strong> {loadError}</Banner>
          )}
        </div>
      )}

      {initial ? (
        <RowsSkeleton rows={2} />
      ) : branches.length === 0 ? (
        loadError ? <div className="pb-3" /> : (
          <EmptyState
            title="No branches synced yet"
            hint="Click “Sync Branches” to pull the current registry from HR Platform." />
        )
      ) : (
        <div className="overflow-x-auto mt-1">
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: SUBTLE_BG }}>
                {['Branch', 'Code', 'Main Email', 'Status', 'Last Synced'].map(h => (
                  <th key={h} className={TH} style={{ color: 'var(--mid-gray)', borderBottom: '1px solid var(--light-gray)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {branches.map(b => (
                <tr key={b.id} style={{ borderTop: '1px solid var(--light-gray)' }}>
                  <td className="px-4 py-2.5 min-w-[160px]">
                    <p className="text-[13px] font-semibold" style={{ color: 'var(--charcoal)' }}>{b.name}</p>
                    {b.brandName && <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{b.brandName}</p>}
                  </td>
                  <td className="px-4 py-2.5">
                    <code className="text-[11.5px] px-1.5 py-0.5 rounded" style={{ background: SUBTLE_BG, color: 'var(--charcoal)', border: '1px solid var(--light-gray)' }}>
                      {b.shortCode}
                    </code>
                  </td>
                  <td className="px-4 py-2.5 text-[13px] break-all" style={{ color: 'var(--charcoal)' }}>{b.emailMain || '—'}</td>
                  <td className="px-4 py-2.5">
                    {b.active
                      ? <StatusPill tone="connected">Active</StatusPill>
                      : <StatusPill tone="off">Inactive</StatusPill>}
                  </td>
                  <td className="px-4 py-2.5 text-[12px] whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>
                    {new Date(b.syncedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ProviderCard>
  )
}

// ── Branch CC Emails section ────────────────────────────────────────────────
// Lets the super admin (main@sapphireclinicseast.org) configure which email
// addresses get CC'd when the front desk emails Progress Reports (and other
// patient-facing documents) to a patient.

interface BranchCCRow {
  id: string
  branch: string
  email: string  // comma-separated allowed
  notes: string | null
  updatedAt: string
}

function BranchCCEmailsSection() {
  const [allowed, setAllowed] = useState(true)
  const [knownBranches, setKnownBranches] = useState<string[]>([])
  const [rows, setRows] = useState<BranchCCRow[]>([])
  const [loading, setLoading] = useState(true)
  // Display only: a failed load used to render an empty card.
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [editing, setEditing] = useState<Record<string, { email: string; notes: string }>>({})

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      const r = await fetch('/api/admin/branch-cc-emails')
      if (r.status === 403 || r.status === 401) { setAllowed(false); return }
      const d = await r.json()
      setKnownBranches(d.knownBranches || [])
      setRows(d.ccEmails || [])
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load CC emails')
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  if (!allowed) return null

  function existing(branch: string) { return rows.find(r => r.branch === branch) }
  function valueFor(branch: string) {
    const ed = editing[branch]
    if (ed) return ed
    const r = existing(branch)
    return { email: r?.email ?? '', notes: r?.notes ?? '' }
  }
  function setField(branch: string, key: 'email' | 'notes', val: string) {
    setEditing(prev => ({ ...prev, [branch]: { ...valueFor(branch), [key]: val } }))
  }

  async function save(branch: string) {
    const v = valueFor(branch)
    if (!v.email.trim()) { alert('Enter at least one email address'); return }
    setSaving(branch)
    try {
      const r = await fetch('/api/admin/branch-cc-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, email: v.email, notes: v.notes }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Save failed')
      setEditing(prev => { const c = { ...prev }; delete c[branch]; return c })
      await load()
    } catch (e) { alert((e as Error).message) }
    finally { setSaving(null) }
  }

  async function remove(branch: string) {
    if (!confirm(`Remove CC emails for ${branchLabel(branch) ?? branch}?`)) return
    setSaving(branch)
    try {
      const r = await fetch('/api/admin/branch-cc-emails?branch=' + encodeURIComponent(branch), { method: 'DELETE' })
      if (!r.ok) throw new Error('Delete failed')
      setEditing(prev => { const c = { ...prev }; delete c[branch]; return c })
      await load()
    } catch (e) { alert((e as Error).message) }
    finally { setSaving(null) }
  }

  const configured = knownBranches.filter(b => !!existing(b)).length
  const initial = loading && knownBranches.length === 0

  return (
    <ProviderCard
      tile={<ProviderTile color="#ED6823" bg="#FFF3E8"><Mail size={18} /></ProviderTile>}
      name="Progress Report CC Emails"
      description={<>Email addresses CC&apos;d when front desk emails a Progress Report. One config per branch — you can list multiple addresses separated by commas.</>}
      status={initial
        ? <StatusPill tone="checking">Checking…</StatusPill>
        : loadError
          ? <StatusPill tone="error">Error</StatusPill>
          : knownBranches.length
            ? <StatusPill tone={configured ? 'connected' : 'off'}>{configured} of {knownBranches.length} set</StatusPill>
            : undefined}
    >
      {loadError && (
        <div className="px-5 pt-3">
          <Banner tone="error" onRetry={load}><strong>Couldn&rsquo;t load CC emails.</strong> {loadError}</Banner>
        </div>
      )}
      {initial ? (
        <RowsSkeleton rows={2} />
      ) : (
        <div className="p-5 grid md:grid-cols-2 gap-3">
          {knownBranches.map(branch => {
            const v = valueFor(branch)
            const existed = !!existing(branch)
            const dirty = !!editing[branch]
            return (
              <div key={branch} className="rounded-lg p-3.5 min-w-0" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="text-xs font-bold uppercase tracking-widest truncate" style={{ color: '#ED6823' }}>
                    {branchLabel(branch) ?? branch}
                  </span>
                  {existed && !dirty && <StatusPill tone="connected">Saved</StatusPill>}
                  {dirty && <StatusPill tone="expired">Unsaved</StatusPill>}
                </div>
                <input
                  type="text"
                  value={v.email}
                  onChange={e => setField(branch, 'email', e.target.value)}
                  placeholder="alice@example.com, bob@example.com"
                  aria-label={`CC emails for ${branchLabel(branch) ?? branch}`}
                  className={`${CONTROL} mb-2`}
                  style={CONTROL_STYLE}
                />
                <input
                  type="text"
                  value={v.notes}
                  onChange={e => setField(branch, 'notes', e.target.value)}
                  placeholder="Notes (optional)"
                  aria-label={`Notes for ${branchLabel(branch) ?? branch}`}
                  className="w-full h-9 px-3 rounded-lg text-xs outline-none mb-2.5 focus:border-[var(--teal)]"
                  style={{ ...CONTROL_STYLE, color: 'var(--mid-gray)' }}
                />
                <div className="flex gap-2 justify-end">
                  {existed && (
                    <button
                      onClick={() => remove(branch)}
                      disabled={saving === branch}
                      className={BTN_DANGER_GHOST}
                      style={{ color: DANGER }}
                    >
                      <Trash2 size={12} />
                      Remove
                    </button>
                  )}
                  <button
                    onClick={() => save(branch)}
                    disabled={saving === branch || (!dirty && existed)}
                    className={BTN_SM}
                    style={{
                      background: dirty || !existed ? 'var(--teal)' : '#E5E7EB',
                      color: dirty || !existed ? '#fff' : 'var(--mid-gray)',
                      cursor: (dirty || !existed) && saving !== branch ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {saving === branch ? 'Saving…' : existed ? 'Update' : 'Save'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </ProviderCard>
  )
}
