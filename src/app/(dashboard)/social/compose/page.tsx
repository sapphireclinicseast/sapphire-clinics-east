'use client'

import { useState, useEffect } from 'react'
import { Sparkles, Facebook, Instagram, Send, Image as ImageIcon, Video, X, Link2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'

const CanvaDesignPicker = dynamic(() => import('@/components/canva/CanvaDesignPicker'), { ssr: false })

interface ConnectedAccount {
  id: string
  platform: 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK'
  pageName: string
  accountId: string
}

const PLATFORM_COLOR: Record<string, string> = {
  FACEBOOK: '#1877F2',
  INSTAGRAM: '#E1306C',
  TIKTOK: '#000000',
}

export default function ComposePage() {
  const router = useRouter()
  const [content, setContent] = useState('')
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])
  const [scheduledAt, setScheduledAt] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image')
  const [generating, setGenerating] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [saving, setSaving] = useState(false)
  const [showAiInput, setShowAiInput] = useState(false)
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [showCanvaPicker, setShowCanvaPicker] = useState(false)
  const [canvaImageUrl, setCanvaImageUrl] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/social/accounts')
      .then((r) => r.json())
      .then((d) => {
        const accs = d.accounts || []
        setConnectedAccounts(accs)
        setSelectedAccountIds(accs.map((a: ConnectedAccount) => a.id))
      })
      .finally(() => setLoadingAccounts(false))
  }, [])

  function toggleAccount(id: string) {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setCanvaImageUrl(null)
    const isVideo = file.type.startsWith('video/')
    setMediaType(isVideo ? 'video' : 'image')
    if (isVideo) {
      setImagePreview(URL.createObjectURL(file))
    } else {
      const reader = new FileReader()
      reader.onload = (ev) => setImagePreview(ev.target?.result as string)
      reader.readAsDataURL(file)
    }
  }

  function handleCanvaImport(imageUrl: string, _designTitle: string) {
    setCanvaImageUrl(imageUrl)
    setImagePreview(imageUrl)
    setImageFile(null)
    setShowCanvaPicker(false)
  }

  function clearImage() {
    setImageFile(null)
    setImagePreview(null)
    setCanvaImageUrl(null)
    setMediaType('image')
  }

  async function generateCaption() {
    if (!aiPrompt.trim()) return
    setGenerating(true)
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generation failed')
      if (data.caption) setContent(data.caption)
      setShowAiInput(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate caption.')
    } finally {
      setGenerating(false)
    }
  }

  async function handleSubmit(status: 'DRAFT' | 'SCHEDULED') {
    if (!content.trim()) return alert('Please add some content.')
    if (status === 'SCHEDULED' && !scheduledAt) return alert('Please set a scheduled time.')
    if (selectedAccountIds.length === 0) return alert('Please select at least one account.')

    const selectedAccounts = connectedAccounts.filter((a) => selectedAccountIds.includes(a.id))
    const platforms = [...new Set(selectedAccounts.map((a) => a.platform))]

    setSaving(true)
    const formData = new FormData()
    formData.append('content', content)
    formData.append('platforms', JSON.stringify(platforms))
    formData.append('accountIds', JSON.stringify(selectedAccountIds))
    formData.append('status', status)
    if (scheduledAt) formData.append('scheduledAt', scheduledAt)
    if (imageFile) formData.append('image', imageFile)
    formData.append('mediaType', mediaType)
    // For Canva images, pass the server-side URL directly
    if (canvaImageUrl && !imageFile) formData.append('imageUrl', canvaImageUrl)

    try {
      const res = await fetch('/api/social/post', { method: 'POST', body: formData })
      if (!res.ok) throw new Error()
      router.push('/social/scheduled')
    } catch {
      alert('Failed to save post.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="max-w-3xl space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>
            Social Media
          </p>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            New Post
          </h1>
        </div>

        <div className="rounded-xl p-6 space-y-5" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>

          {/* Account selector */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--mid-gray)' }}>
                Post To
              </label>
              <Link href="/settings/accounts" className="flex items-center gap-1 text-xs" style={{ color: 'var(--teal)' }}>
                <Link2 size={11} />
                Manage accounts
              </Link>
            </div>

            {loadingAccounts ? (
              <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>Loading accounts…</p>
            ) : connectedAccounts.length === 0 ? (
              <div className="flex items-center gap-3 p-4 rounded-lg" style={{ background: '#FFF9EC', border: '1px solid rgba(201,162,39,0.3)' }}>
                <span className="text-sm" style={{ color: 'var(--gold)' }}>
                  No accounts connected.{' '}
                  <Link href="/settings/accounts" className="underline font-semibold">
                    Connect your Facebook & Instagram pages
                  </Link>
                  {' '}to start scheduling.
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {connectedAccounts.map((account) => {
                  const selected = selectedAccountIds.includes(account.id)
                  const color = PLATFORM_COLOR[account.platform] ?? '#888'
                  const PlatformIcon = account.platform === 'FACEBOOK' ? Facebook : Instagram
                  return (
                    <button
                      key={account.id}
                      onClick={() => toggleAccount(account.id)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all"
                      style={{
                        background: selected ? `${color}18` : 'var(--light-gray)',
                        border: `1.5px solid ${selected ? color : 'transparent'}`,
                        color: selected ? color : 'var(--mid-gray)',
                      }}
                    >
                      <PlatformIcon size={14} />
                      {account.pageName || account.accountId}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Caption */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--mid-gray)' }}>
                Caption / Content
              </label>
              <button
                onClick={() => setShowAiInput(!showAiInput)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}
              >
                <Sparkles size={13} />
                Generate with AI
              </button>
            </div>

            {showAiInput && (
              <div className="mb-3 p-3 rounded-lg space-y-2" style={{ background: 'var(--pale-teal)' }}>
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Describe what to write (e.g. 'Monday motivation for rehab patients')"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ border: '1px solid rgba(26,123,138,0.3)', background: '#fff' }}
                  onKeyDown={(e) => e.key === 'Enter' && generateCaption()}
                />
                <button
                  onClick={generateCaption}
                  disabled={generating}
                  className="px-4 py-1.5 rounded-lg text-sm font-semibold"
                  style={{ background: 'var(--teal)', color: '#fff' }}
                >
                  {generating ? 'Generating…' : 'Generate'}
                </button>
              </div>
            )}

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              placeholder="Write your post caption here, or use AI to generate one…"
              className="w-full px-4 py-3 rounded-lg text-sm outline-none resize-none"
              style={{ border: '1.5px solid var(--light-gray)', fontFamily: 'var(--font-body)', color: 'var(--charcoal)' }}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>{content.length} characters</p>
          </div>

          {/* Media upload */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--mid-gray)' }}>
                Image / Video (optional — required for Instagram)
              </label>
              {!imagePreview && (
                <button
                  onClick={() => setShowCanvaPicker(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
                  style={{ background: '#EDE9FE', color: '#7B2FBE' }}
                >
                  <span className="font-bold">C</span>
                  Import from Canva
                </button>
              )}
            </div>

            {imagePreview ? (
              <div className="relative inline-block">
                {mediaType === 'video' ? (
                  <video src={imagePreview} controls className="rounded-xl" style={{ maxHeight: 240, maxWidth: '100%' }} />
                ) : (
                  <img src={imagePreview} alt="Preview" className="rounded-xl object-cover" style={{ maxHeight: 240, maxWidth: '100%' }} />
                )}
                {canvaImageUrl && (
                  <div
                    className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold text-white"
                    style={{ background: '#7B2FBE' }}
                  >
                    <span>C</span> Canva
                  </div>
                )}
                <button
                  onClick={clearImage}
                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div className="flex gap-3">
                <label
                  className="flex-1 flex flex-col items-center justify-center gap-2 px-6 py-8 rounded-xl cursor-pointer"
                  style={{ border: '2px dashed var(--light-gray)', color: 'var(--mid-gray)' }}
                >
                  <div className="flex gap-2">
                    <ImageIcon size={22} />
                    <Video size={22} />
                  </div>
                  <span className="text-sm">Click to upload image or video</span>
                  <span className="text-xs opacity-60">JPG, PNG, MP4, MOV supported</span>
                  <input type="file" accept="image/*,video/*" className="hidden" onChange={handleImageChange} />
                </label>
                <button
                  onClick={() => setShowCanvaPicker(true)}
                  className="flex-1 flex flex-col items-center justify-center gap-2 px-6 py-8 rounded-xl cursor-pointer transition-all hover:border-purple-400"
                  style={{ border: '2px dashed #C4B5FD', color: '#7B2FBE' }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold" style={{ background: '#7B2FBE' }}>C</div>
                  <span className="text-sm font-semibold">Import from Canva</span>
                  <span className="text-xs opacity-70">Browse your Canva designs</span>
                </button>
              </div>
            )}
          </div>

          {/* Schedule time */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--mid-gray)' }}>
              Schedule Date & Time
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="px-4 py-2.5 rounded-lg text-sm outline-none"
              style={{ border: '1.5px solid var(--light-gray)', color: 'var(--charcoal)' }}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => handleSubmit('DRAFT')}
              disabled={saving}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold"
              style={{ background: 'var(--light-gray)', color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}
            >
              Save as Draft
            </button>
            <button
              onClick={() => handleSubmit('SCHEDULED')}
              disabled={saving || !scheduledAt || selectedAccountIds.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold"
              style={{
                background: scheduledAt && selectedAccountIds.length > 0 ? 'var(--teal)' : 'var(--light-gray)',
                color: scheduledAt && selectedAccountIds.length > 0 ? '#fff' : 'var(--mid-gray)',
                fontFamily: 'var(--font-display)',
              }}
            >
              <Send size={14} />
              {saving
                ? 'Scheduling…'
                : `Schedule to ${selectedAccountIds.length} account${selectedAccountIds.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>

      {/* Canva Design Picker Modal */}
      {showCanvaPicker && (
        <CanvaDesignPicker
          onSelect={handleCanvaImport}
          onClose={() => setShowCanvaPicker(false)}
        />
      )}
    </>
  )
}
