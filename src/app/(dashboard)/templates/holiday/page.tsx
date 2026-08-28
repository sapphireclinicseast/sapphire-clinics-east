'use client'

import { useState, useRef } from 'react'
import { Sparkles, Plus, Trash2, Send, X, Image as ImageIcon, Upload, Video } from 'lucide-react'
import dynamic from 'next/dynamic'

const CanvaDesignPicker = dynamic(() => import('@/components/canva/CanvaDesignPicker'), { ssr: false })

const BRANCHES = [
  { id: 'east', label: 'East Branch', color: '#2E5E5A' },
  { id: 'greenhills', label: 'Greenhills Branch', color: '#2E5E5A' },
  { id: 'verdana', label: 'Verdana Store', color: '#2D6A4F' },
]

interface HolidayEntry {
  id: string
  name: string
  date: string
  captions: string[]
  selectedCaption: number
  branch: string
  platforms: string[]
  scheduledAt: string
  imageUrl?: string
  mediaFile?: File | null
  mediaType?: string
}

export default function HolidayTemplatePage() {
  const [holidays, setHolidays] = useState<HolidayEntry[]>([
    { id: '1', name: '', date: '', captions: [], selectedCaption: 0, branch: 'east', platforms: ['FACEBOOK', 'INSTAGRAM'], scheduledAt: '' },
  ])
  const [generating, setGenerating] = useState<string | null>(null)
  const [scheduling, setScheduling] = useState<string | null>(null)
  const [scheduled, setScheduled] = useState<string[]>([])
  const [showCanvaFor, setShowCanvaFor] = useState<string | null>(null)

  // Per-entry hidden file input refs
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  function addHoliday() {
    setHolidays((prev) => [
      ...prev,
      { id: String(Date.now()), name: '', date: '', captions: [], selectedCaption: 0, branch: 'east', platforms: ['FACEBOOK', 'INSTAGRAM'], scheduledAt: '' },
    ])
  }

  function removeHoliday(id: string) {
    setHolidays((prev) => prev.filter((h) => h.id !== id))
  }

  function updateHoliday(id: string, updates: Partial<HolidayEntry>) {
    setHolidays((prev) => prev.map((h) => (h.id === id ? { ...h, ...updates } : h)))
  }

  function handleFileChange(holidayId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const type = file.type.startsWith('video/') ? 'video' : 'image'
    updateHoliday(holidayId, { mediaFile: file, mediaType: type, imageUrl: undefined })
  }

  function clearMedia(holidayId: string) {
    updateHoliday(holidayId, { mediaFile: null, mediaType: undefined, imageUrl: undefined })
    // Reset the file input so the same file can be re-selected
    const input = fileInputRefs.current[holidayId]
    if (input) input.value = ''
  }

  function handleCanvaImport(holidayId: string, imageUrl: string) {
    updateHoliday(holidayId, { imageUrl, mediaFile: null, mediaType: 'image' })
    setShowCanvaFor(null)
  }

  // Update a specific caption text (for inline editing)
  function updateCaption(holidayId: string, idx: number, text: string) {
    setHolidays((prev) =>
      prev.map((h) => {
        if (h.id !== holidayId) return h
        const updated = [...h.captions]
        updated[idx] = text
        return { ...h, captions: updated }
      })
    )
  }

  async function generateCaptions(holiday: HolidayEntry) {
    if (!holiday.name.trim() || !holiday.date) return alert('Enter holiday name and date.')
    setGenerating(holiday.id)
    try {
      const res = await fetch('/api/templates/holiday', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holiday: holiday.name, date: holiday.date, branch: holiday.branch }),
      })
      const data = await res.json()
      updateHoliday(holiday.id, { captions: data.captions || [], selectedCaption: 0 })
    } catch {
      alert('Failed to generate captions.')
    } finally {
      setGenerating(null)
    }
  }

  async function scheduleHolidayPost(holiday: HolidayEntry) {
    if (!holiday.scheduledAt) return alert('Set a scheduled date/time.')
    if (holiday.platforms.length === 0) return alert('Select at least one platform.')
    if (!holiday.captions[holiday.selectedCaption]) return alert('Generate a caption first.')
    setScheduling(holiday.id)
    try {
      const form = new FormData()
      form.append('content', holiday.captions[holiday.selectedCaption])
      form.append('caption', holiday.captions[holiday.selectedCaption])
      form.append('platforms', JSON.stringify(holiday.platforms))
      form.append('branch', holiday.branch)
      form.append('scheduledAt', holiday.scheduledAt)
      form.append('status', 'SCHEDULED')
      if (holiday.mediaFile) {
        form.append('image', holiday.mediaFile)
        form.append('mediaType', holiday.mediaType ?? 'image')
      } else if (holiday.imageUrl) {
        form.append('imageUrl', holiday.imageUrl)
      }

      const res = await fetch('/api/social/post', { method: 'POST', body: form })
      if (!res.ok) throw new Error()
      setScheduled((prev) => [...prev, holiday.id])
    } catch {
      alert('Failed to schedule post.')
    } finally {
      setScheduling(null)
    }
  }

  return (
    <>
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>
            Templates
          </p>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            Holiday Posts
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
            Add holidays and generate AI-powered caption suggestions.
          </p>
        </div>
        <button
          onClick={addHoliday}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold"
          style={{ background: 'var(--teal)', color: '#fff', fontFamily: 'var(--font-display)' }}
        >
          <Plus size={16} />
          Add Holiday
        </button>
      </div>

      <div className="space-y-4">
        {holidays.map((holiday) => {
          const isDone = scheduled.includes(holiday.id)
          const activeBranch = BRANCHES.find((b) => b.id === holiday.branch) ?? BRANCHES[0]
          const hasMedia = !!(holiday.mediaFile || holiday.imageUrl)
          return (
            <div
              key={holiday.id}
              className="rounded-xl p-5 space-y-4"
              style={{
                background: isDone ? 'rgba(46,94,90,0.04)' : '#fff',
                border: `1px solid ${isDone ? 'var(--teal)' : 'var(--light-gray)'}`,
              }}
            >
              {isDone && (
                <div
                  className="text-xs font-semibold px-3 py-1.5 rounded-full inline-flex items-center gap-1.5"
                  style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}
                >
                  <Sparkles size={12} /> Scheduled successfully
                </div>
              )}

              {/* Branch selector */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--mid-gray)' }}>
                  Post To Branch
                </label>
                <div className="flex gap-2 flex-wrap">
                  {BRANCHES.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => !isDone && updateHoliday(holiday.id, { branch: b.id })}
                      disabled={isDone}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                      style={{
                        background: holiday.branch === b.id
                          ? `${b.color}18`
                          : 'var(--light-gray)',
                        border: `1.5px solid ${holiday.branch === b.id ? b.color : 'transparent'}`,
                        color: holiday.branch === b.id ? b.color : 'var(--mid-gray)',
                      }}
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: holiday.branch === b.id ? b.color : 'var(--mid-gray)' }}
                      />
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Holiday name + date row */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--mid-gray)' }}>
                    Holiday Name
                  </label>
                  <input
                    type="text"
                    value={holiday.name}
                    onChange={(e) => updateHoliday(holiday.id, { name: e.target.value })}
                    placeholder="e.g. Christmas, Valentine's Day"
                    className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                    style={{ border: '1.5px solid var(--light-gray)', color: 'var(--charcoal)' }}
                    disabled={isDone}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--mid-gray)' }}>
                    Date
                  </label>
                  <input
                    type="date"
                    value={holiday.date}
                    onChange={(e) => updateHoliday(holiday.id, { date: e.target.value })}
                    className="px-3 py-2.5 rounded-lg text-sm outline-none"
                    style={{ border: '1.5px solid var(--light-gray)', color: 'var(--charcoal)' }}
                    disabled={isDone}
                  />
                </div>
                <button
                  onClick={() => generateCaptions(holiday)}
                  disabled={generating === holiday.id || isDone}
                  className="self-end flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold"
                  style={{ background: 'var(--pale-teal)', color: 'var(--teal)', fontFamily: 'var(--font-display)' }}
                >
                  <Sparkles size={14} />
                  {generating === holiday.id ? 'Generating…' : 'Generate'}
                </button>
              </div>

              {/* Media (optional) — hidden file input */}
              <input
                ref={(el) => { fileInputRefs.current[holiday.id] = el }}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => handleFileChange(holiday.id, e)}
              />

              {!isDone && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--mid-gray)' }}>
                    Photo / Video (optional)
                  </label>

                  {hasMedia ? (
                    /* Preview of selected media */
                    <div className="relative inline-block">
                      {holiday.mediaFile ? (
                        holiday.mediaType === 'video' ? (
                          <video
                            src={URL.createObjectURL(holiday.mediaFile)}
                            className="rounded-xl object-cover"
                            style={{ maxHeight: 160, maxWidth: '100%' }}
                            muted
                            playsInline
                          />
                        ) : (
                          <img
                            src={URL.createObjectURL(holiday.mediaFile)}
                            alt="Holiday"
                            className="rounded-xl object-cover"
                            style={{ maxHeight: 160, maxWidth: '100%' }}
                          />
                        )
                      ) : (
                        <img
                          src={holiday.imageUrl}
                          alt="Holiday"
                          className="rounded-xl object-cover"
                          style={{ maxHeight: 160, maxWidth: '100%' }}
                        />
                      )}
                      {/* Source badge */}
                      <div
                        className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold text-white"
                        style={{ background: holiday.imageUrl ? '#7B2FBE' : '#2E5E5A' }}
                      >
                        {holiday.imageUrl ? (
                          <><span>C</span> Canva</>
                        ) : holiday.mediaType === 'video' ? (
                          <><Video size={10} /> Video</>
                        ) : (
                          <><ImageIcon size={10} /> Photo</>
                        )}
                      </div>
                      <button
                        onClick={() => clearMedia(holiday.id)}
                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    /* Upload + Canva side-by-side tiles */
                    <div className="flex gap-3">
                      {/* Local file upload tile */}
                      <button
                        onClick={() => fileInputRefs.current[holiday.id]?.click()}
                        className="flex-1 flex flex-col items-center justify-center gap-2 py-4 rounded-xl text-sm transition-all"
                        style={{ border: '2px dashed var(--light-gray)', color: 'var(--mid-gray)' }}
                      >
                        <Upload size={20} style={{ color: 'var(--teal)' }} />
                        <span className="font-medium">Upload Photo or Video</span>
                        <span className="text-xs opacity-60">JPG, PNG, MP4, MOV…</span>
                      </button>

                      {/* Canva import tile */}
                      <button
                        onClick={() => setShowCanvaFor(holiday.id)}
                        className="flex-1 flex flex-col items-center justify-center gap-2 py-4 rounded-xl text-sm transition-all"
                        style={{ border: '2px dashed #C4B5FD', color: '#7B2FBE' }}
                      >
                        <span className="text-2xl font-extrabold leading-none">C</span>
                        <span className="font-medium">Import from Canva</span>
                        <span className="text-xs opacity-60">Use a Canva design</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Caption options — editable textareas */}
              {holiday.captions.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--mid-gray)' }}>
                    Caption Options <span className="normal-case font-normal">(select one — you can edit)</span>
                  </label>
                  <div className="space-y-3">
                    {holiday.captions.map((cap, idx) => {
                      const isSelected = holiday.selectedCaption === idx
                      return (
                        <div
                          key={idx}
                          className="rounded-lg overflow-hidden"
                          style={{
                            border: `1.5px solid ${isSelected ? 'var(--teal)' : 'var(--light-gray)'}`,
                          }}
                        >
                          {/* Select toggle header */}
                          <button
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-left"
                            style={{
                              background: isSelected ? 'var(--pale-teal)' : 'var(--light-gray)',
                              color: isSelected ? 'var(--teal)' : 'var(--mid-gray)',
                            }}
                            onClick={() => !isDone && updateHoliday(holiday.id, { selectedCaption: idx })}
                            disabled={isDone}
                          >
                            <span
                              className="w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                              style={{ borderColor: isSelected ? 'var(--teal)' : 'var(--mid-gray)' }}
                            >
                              {isSelected && (
                                <span className="w-2 h-2 rounded-full block" style={{ background: 'var(--teal)' }} />
                              )}
                            </span>
                            Option {idx + 1}
                            {isSelected && <span className="ml-auto">✓ Selected</span>}
                          </button>
                          {/* Editable textarea */}
                          <textarea
                            value={cap}
                            onChange={(e) => updateCaption(holiday.id, idx, e.target.value)}
                            rows={4}
                            disabled={isDone}
                            className="w-full px-3 py-2.5 text-sm outline-none resize-none"
                            style={{
                              color: 'var(--charcoal)',
                              background: isSelected ? 'rgba(46,94,90,0.02)' : '#fff',
                            }}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Platforms + Schedule */}
              {holiday.captions.length > 0 && !isDone && (
                <div className="flex flex-wrap gap-4 items-end">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--mid-gray)' }}>
                      Platforms
                    </label>
                    <div className="flex gap-2">
                      {['FACEBOOK', 'INSTAGRAM'].map((p) => (
                        <button
                          key={p}
                          onClick={() =>
                            updateHoliday(holiday.id, {
                              platforms: holiday.platforms.includes(p)
                                ? holiday.platforms.filter((x) => x !== p)
                                : [...holiday.platforms, p],
                            })
                          }
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                          style={{
                            background: holiday.platforms.includes(p) ? (p === 'FACEBOOK' ? '#1877F218' : '#E1306C18') : 'var(--light-gray)',
                            border: `1.5px solid ${holiday.platforms.includes(p) ? (p === 'FACEBOOK' ? '#1877F2' : '#E1306C') : 'transparent'}`,
                            color: holiday.platforms.includes(p) ? (p === 'FACEBOOK' ? '#1877F2' : '#E1306C') : 'var(--mid-gray)',
                          }}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--mid-gray)' }}>
                      Schedule
                    </label>
                    <input
                      type="datetime-local"
                      value={holiday.scheduledAt}
                      onChange={(e) => updateHoliday(holiday.id, { scheduledAt: e.target.value })}
                      className="px-3 py-2 rounded-lg text-sm outline-none"
                      style={{ border: '1.5px solid var(--light-gray)', color: 'var(--charcoal)' }}
                    />
                  </div>
                  <button
                    onClick={() => scheduleHolidayPost(holiday)}
                    disabled={scheduling === holiday.id}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold"
                    style={{ background: activeBranch.color, color: '#fff' }}
                  >
                    <Send size={14} />
                    {scheduling === holiday.id ? 'Scheduling…' : `Schedule for ${activeBranch.label}`}
                  </button>
                </div>
              )}

              {/* Remove button */}
              {!isDone && holidays.length > 1 && (
                <div className="flex justify-end">
                  <button
                    onClick={() => removeHoliday(holiday.id)}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded"
                    style={{ color: '#DC2626' }}
                  >
                    <Trash2 size={12} />
                    Remove
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>

    {/* Canva Design Picker Modal */}
    {showCanvaFor && (
      <CanvaDesignPicker
        onSelect={(imageUrl) => handleCanvaImport(showCanvaFor, imageUrl)}
        onClose={() => setShowCanvaFor(null)}
      />
    )}
    </>
  )
}
