'use client'

import { useState, useRef, useEffect } from 'react'
import { Cake, Upload, Sparkles, Send, Image as ImageIcon, Video, X } from 'lucide-react'
import dynamic from 'next/dynamic'

const CanvaDesignPicker = dynamic(() => import('@/components/canva/CanvaDesignPicker'), { ssr: false })

export default function BirthdayTemplatePage() {
  const [staffName, setStaffName] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoMediaType, setPhotoMediaType] = useState<'image' | 'video'>('image')
  const [canvaImageUrl, setCanvaImageUrl] = useState<string | null>(null)
  const [showCanvaPicker, setShowCanvaPicker] = useState(false)
  const [caption, setCaption] = useState('')
  const [branch, setBranch] = useState('east')
  const [template, setTemplate] = useState('sandbox')
  const [generating, setGenerating] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [scheduledAt, setScheduledAt] = useState('')
  const [platforms, setPlatforms] = useState<string[]>(['FACEBOOK', 'INSTAGRAM'])
  const [scheduling, setScheduling] = useState(false)
  const [success, setSuccess] = useState(false)

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setCanvaImageUrl(null)
    const isVideo = file.type.startsWith('video/')
    setPhotoMediaType(isVideo ? 'video' : 'image')
    if (isVideo) {
      setPhotoPreview(URL.createObjectURL(file))
    } else {
      const reader = new FileReader()
      reader.onload = (ev) => setPhotoPreview(ev.target?.result as string)
      reader.readAsDataURL(file)
    }
  }

  function handleCanvaImport(imageUrl: string) {
    setCanvaImageUrl(imageUrl)
    setPhotoPreview(imageUrl)
    setPhotoFile(null)
    setShowCanvaPicker(false)
  }

  function clearPhoto() {
    setPhotoFile(null)
    setPhotoPreview(null)
    setCanvaImageUrl(null)
    setPhotoMediaType('image')
  }

  const noCard = template === 'none'

  // ── Preview scaling: fit 1080×1350 card into container ────────────────────
  const previewContainerRef = useRef<HTMLDivElement>(null)
  const [previewScale, setPreviewScale] = useState(0.4)

  useEffect(() => {
    if (!previewContainerRef.current) return
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width
      if (w > 0) setPreviewScale(w / 1080)
    })
    ro.observe(previewContainerRef.current)
    // Initial measurement
    const w = previewContainerRef.current.getBoundingClientRect().width
    if (w > 0) setPreviewScale(w / 1080)
    return () => ro.disconnect()
  }, [])

  async function generateCard() {
    if (!staffName.trim()) return alert('Enter the staff member\'s name.')
    if (!noCard && !photoFile && !canvaImageUrl) return alert('Upload a photo first, or choose "No Card Design".')
    setGenerating(true)
    try {
      const captionRes = await fetch('/api/templates/birthday', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffName }),
      })
      const captionData = await captionRes.json()
      const generatedCaption = captionData.caption || `Wishing ${staffName} a wonderful birthday! 🎂`
      setCaption(generatedCaption)

      if (!noCard) {
        const previewRes = await fetch('/api/templates/birthday/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ staffName, caption: generatedCaption, photoDataUrl: photoPreview, branch, template }),
        })
        const previewData = await previewRes.json()
        setPreviewHtml(previewData.html)
      }
    } catch {
      alert('Failed to generate. Check your API connection.')
    } finally {
      setGenerating(false)
    }
  }

  async function schedulePost() {
    if (!scheduledAt) return alert('Set a scheduled time.')
    if (platforms.length === 0) return alert('Select at least one platform.')
    setScheduling(true)
    try {
      const formData = new FormData()
      formData.append('staffName', staffName)
      formData.append('caption', caption)
      formData.append('platforms', JSON.stringify(platforms))
      formData.append('branch', branch)
      formData.append('scheduledAt', scheduledAt)
      if (photoFile) formData.append('photo', photoFile)
      formData.append('mediaType', photoMediaType)
      if (canvaImageUrl && !photoFile) formData.append('imageUrl', canvaImageUrl)

      const res = await fetch('/api/templates/birthday/schedule', { method: 'POST', body: formData })
      if (!res.ok) throw new Error()
      setSuccess(true)
    } catch {
      alert('Failed to schedule post.')
    } finally {
      setScheduling(false)
    }
  }

  if (success) {
    return (
      <div className="max-w-xl flex flex-col items-center text-center py-16">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
          style={{ background: 'var(--pale-teal)' }}
        >
          <Cake size={36} style={{ color: 'var(--teal)' }} />
        </div>
        <h2 className="text-xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          Birthday Post Scheduled!
        </h2>
        <p className="text-sm mb-6" style={{ color: 'var(--mid-gray)' }}>
          The birthday post for {staffName} has been scheduled successfully.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => { setSuccess(false); setStaffName(''); setPhotoFile(null); setPhotoPreview(null); setCanvaImageUrl(null); setCaption(''); setPreviewHtml(null) }}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--teal)', color: '#fff' }}
          >
            Create Another
          </button>
          <a
            href="/social/scheduled"
            className="px-5 py-2.5 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--light-gray)', color: 'var(--charcoal)' }}
          >
            View Scheduled
          </a>
        </div>
      </div>
    )
  }

  return (
    <>
    <div className="max-w-4xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>
          Templates
        </p>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          Birthday Post Generator
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
          Upload a staff photo and generate a branded birthday post for Facebook & Instagram.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: Inputs */}
        <div className="rounded-xl p-6 space-y-5" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
          {/* Branch selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--mid-gray)' }}>
              Branch
            </label>
            <div className="flex gap-2 flex-wrap">
              {[
                { id: 'east', label: 'East Branch', color: '#1A7B8A' },
                { id: 'greenhills', label: 'Greenhills Branch', color: '#1A7B8A' },
                { id: 'verdana', label: 'Verdana Store', color: '#2D6A4F' },
              ].map((b) => (
                <button
                  key={b.id}
                  onClick={() => setBranch(b.id)}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
                  style={{
                    background: branch === b.id ? `${b.color}18` : 'var(--light-gray)',
                    border: `1.5px solid ${branch === b.id ? b.color : 'transparent'}`,
                    color: branch === b.id ? b.color : 'var(--mid-gray)',
                  }}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* Template style selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--mid-gray)' }}>
              Card Design
            </label>
            <div className="grid grid-cols-1 gap-2">
              {[
                { id: 'sandbox', label: 'Sandbox Brand Guide', color: '#F47427', desc: 'Orange brand style' },
                { id: 'verdana', label: 'Verdana Brand Guide', color: '#2D6A4F', desc: 'Green brand style' },
                { id: 'none', label: '✕ No Card — Text Only', color: '#D97706', desc: 'Caption only, no image' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t.id)}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all text-left"
                  style={{
                    background: template === t.id ? `${t.color}14` : 'var(--light-gray)',
                    border: `1.5px solid ${template === t.id ? t.color : 'transparent'}`,
                    color: template === t.id ? t.color : 'var(--mid-gray)',
                  }}
                >
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ background: template === t.id ? t.color : 'var(--mid-gray)' }}
                  />
                  <span className="flex-1">{t.label}</span>
                  <span className="text-xs opacity-60 font-normal">{t.desc}</span>
                </button>
              ))}
            </div>
            {noCard && (
              <p className="text-xs mt-2 px-1" style={{ color: '#D97706' }}>
                Text-only mode: no image will be attached. Just a caption is posted.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--mid-gray)' }}>
              Staff Member&apos;s Name
            </label>
            <input
              type="text"
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              placeholder="e.g. Maria Santos"
              className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
              style={{ border: '1.5px solid var(--light-gray)', color: 'var(--charcoal)' }}
            />
          </div>

          {!noCard && <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--mid-gray)' }}>
                Staff Photo
              </label>
              {!photoPreview && (
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
            {photoPreview ? (
              <div className="relative">
                {photoMediaType === 'video' ? (
                  <video src={photoPreview} controls className="w-full rounded-xl" style={{ maxHeight: 192 }} />
                ) : (
                  <img
                    src={photoPreview}
                    alt="Staff"
                    className="w-full h-48 object-cover rounded-xl"
                  />
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
                  onClick={clearPhoto}
                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-7 h-7 flex items-center justify-center"
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              <div className="flex gap-3">
                <label
                  className="flex-1 flex flex-col items-center justify-center gap-2 px-4 py-8 rounded-xl cursor-pointer"
                  style={{ border: '2px dashed var(--light-gray)', color: 'var(--mid-gray)' }}
                >
                  <div className="flex gap-2">
                    <Upload size={22} />
                    <Video size={22} />
                  </div>
                  <span className="text-sm">Upload image or video</span>
                  <span className="text-xs">JPG, PNG, MP4, MOV</span>
                  <input type="file" accept="image/*,video/*" className="hidden" onChange={handlePhotoChange} />
                </label>
                <button
                  onClick={() => setShowCanvaPicker(true)}
                  className="flex-1 flex flex-col items-center justify-center gap-2 px-4 py-8 rounded-xl cursor-pointer transition-all hover:border-purple-400"
                  style={{ border: '2px dashed #C4B5FD', color: '#7B2FBE' }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold" style={{ background: '#7B2FBE' }}>C</div>
                  <span className="text-sm font-semibold">Import from Canva</span>
                  <span className="text-xs opacity-70">Browse your designs</span>
                </button>
              </div>
            )}
          </div>}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--mid-gray)' }}>
                Caption
              </label>
              <button
                onClick={generateCard}
                disabled={generating}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}
              >
                <Sparkles size={12} />
                {generating ? 'Generating…' : 'Auto-generate'}
              </button>
            </div>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              placeholder="Caption will be generated automatically, or write your own…"
              className="w-full px-4 py-3 rounded-lg text-sm outline-none resize-none"
              style={{ border: '1.5px solid var(--light-gray)', color: 'var(--charcoal)' }}
            />
          </div>

          {/* Platforms */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--mid-gray)' }}>
              Post To
            </label>
            <div className="flex gap-2">
              {['FACEBOOK', 'INSTAGRAM'].map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatforms((prev) =>
                    prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
                  )}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
                  style={{
                    background: platforms.includes(p) ? (p === 'FACEBOOK' ? '#1877F218' : '#E1306C18') : 'var(--light-gray)',
                    border: `1.5px solid ${platforms.includes(p) ? (p === 'FACEBOOK' ? '#1877F2' : '#E1306C') : 'transparent'}`,
                    color: platforms.includes(p) ? (p === 'FACEBOOK' ? '#1877F2' : '#E1306C') : 'var(--mid-gray)',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Schedule time */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--mid-gray)' }}>
              Schedule For
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="px-4 py-2.5 rounded-lg text-sm outline-none"
              style={{ border: '1.5px solid var(--light-gray)', color: 'var(--charcoal)' }}
            />
          </div>

          <button
            onClick={schedulePost}
            disabled={scheduling || !caption || !staffName || !scheduledAt}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: caption && staffName && scheduledAt ? 'var(--teal)' : 'var(--light-gray)',
              color: caption && staffName && scheduledAt ? '#fff' : 'var(--mid-gray)',
              fontFamily: 'var(--font-display)',
            }}
          >
            <Send size={15} />
            {scheduling ? 'Scheduling…' : noCard ? 'Schedule Text Post' : 'Schedule Birthday Post'}
          </button>
        </div>

        {/* Right: Preview */}
        <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
          <div
            className="px-5 py-3 text-xs font-semibold uppercase tracking-widest"
            style={{ borderBottom: '1px solid var(--light-gray)', color: 'var(--mid-gray)' }}
          >
            Preview
            {previewHtml && !noCard && (
              <span className="ml-2 normal-case font-normal" style={{ color: 'var(--mid-gray)' }}>
                — 1080 × 1350 px (4:5)
              </span>
            )}
          </div>
          {noCard && caption ? (
            <div className="p-6">
              <div className="rounded-xl p-5" style={{ background: 'var(--pale-teal)', border: '1px solid rgba(26,123,138,0.2)' }}>
                <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--teal)' }}>
                  Text-Only Post Preview
                </p>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--charcoal)', whiteSpace: 'pre-wrap' }}>{caption}</p>
              </div>
              <p className="text-xs mt-3 text-center" style={{ color: 'var(--mid-gray)' }}>
                No image will be attached — caption only
              </p>
            </div>
          ) : previewHtml ? (
            /* Scale 1080×1350 card down to fit container width */
            <div
              ref={previewContainerRef}
              style={{
                width: '100%',
                height: Math.round(1350 * previewScale),
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <iframe
                srcDoc={previewHtml}
                title="Birthday Card Preview"
                scrolling="no"
                style={{
                  width: 1080,
                  height: 1350,
                  border: 'none',
                  transformOrigin: 'top left',
                  transform: `scale(${previewScale})`,
                  position: 'absolute',
                  top: 0,
                  left: 0,
                }}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-80 text-center px-6">
              <ImageIcon size={40} style={{ color: 'var(--light-gray)' }} className="mb-4" />
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>
                Preview will appear here
              </p>
              <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                {noCard
                  ? 'Enter the name and click "Auto-generate" for a text caption'
                  : 'Fill in the name, upload a photo, then click "Auto-generate"'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Canva Design Picker Modal */}
    {showCanvaPicker && (
      <CanvaDesignPicker
        onSelect={(imageUrl) => handleCanvaImport(imageUrl)}
        onClose={() => setShowCanvaPicker(false)}
      />
    )}
  </>
  )
}
