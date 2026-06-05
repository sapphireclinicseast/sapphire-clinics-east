'use client'

import { useState, useEffect } from 'react'
import { Upload, BookOpen, Sparkles, CheckCircle, X, Trash2 } from 'lucide-react'

interface StyleResult {
  colors: string[]
  fonts: string[]
  tone: string
  styleNotes: string
}

interface BrandGuide {
  id: string
  name?: string
  fileName: string
  createdAt: string
  styleJson?: StyleResult | null
}

const BRAND_PRESETS = [
  'Sapphire Clinics East',
  'Verdana Store',
  'Sapphire Clinics East',
]

export default function BrandGuidePage() {
  const [file, setFile] = useState<File | null>(null)
  const [brandName, setBrandName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<StyleResult | null>(null)
  const [resultName, setResultName] = useState('')
  const [error, setError] = useState('')
  const [guides, setGuides] = useState<BrandGuide[]>([])
  const [loadingGuides, setLoadingGuides] = useState(true)

  useEffect(() => { fetchGuides() }, [])

  async function fetchGuides() {
    setLoadingGuides(true)
    try {
      const res = await fetch('/api/brand')
      if (res.ok) {
        const data = await res.json()
        setGuides(data.guides || [])
      }
    } finally {
      setLoadingGuides(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) setFile(f)
  }

  async function uploadAndAnalyze() {
    if (!file) return
    setUploading(true)
    setError('')
    setResult(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      if (brandName.trim()) formData.append('name', brandName.trim())
      const res = await fetch('/api/brand/upload', { method: 'POST', body: formData })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Upload failed')
      }
      const data = await res.json()
      setResult(data.style)
      setResultName(brandName.trim() || file.name)
      setFile(null)
      setBrandName('')
      fetchGuides()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload or analyze. Make sure your Anthropic API key is configured.')
    } finally {
      setUploading(false)
    }
  }

  async function deleteGuide(id: string) {
    if (!confirm('Delete this brand guide?')) return
    await fetch('/api/brand', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    fetchGuides()
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>
          Settings
        </p>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          Brand Guides
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
          Upload brand guides for each clinic so AI generates content that matches each brand's colors, fonts, and voice.
        </p>
      </div>

      {/* Existing guides */}
      {!loadingGuides && guides.length > 0 && (
        <div className="rounded-xl p-5 space-y-3" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--mid-gray)' }}>
            Uploaded Guides ({guides.length})
          </p>
          {guides.map((guide) => {
            const style = guide.styleJson
            return (
              <div key={guide.id} className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--light-gray)' }}>
                <div className="flex items-center gap-3 px-4 py-3" style={{ background: 'var(--pale-teal)' }}>
                  <BookOpen size={16} style={{ color: 'var(--teal)' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>
                      {guide.name || guide.fileName}
                    </p>
                    <p className="text-xs truncate" style={{ color: 'var(--mid-gray)' }}>
                      {guide.name ? guide.fileName + ' · ' : ''}
                      {new Date(guide.createdAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  {style?.colors && style.colors.length > 0 && (
                    <div className="flex gap-1">
                      {style.colors.slice(0, 4).map((c) => (
                        <div key={c} className="w-4 h-4 rounded-full border border-white/50" style={{ background: c }} title={c} />
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => deleteGuide(guide.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0"
                    title="Delete guide"
                  >
                    <Trash2 size={14} style={{ color: '#DC2626' }} />
                  </button>
                </div>
                {style?.tone && (
                  <div className="px-4 py-2.5" style={{ background: '#fff' }}>
                    <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>{style.tone}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Upload card */}
      <div className="rounded-xl p-6 space-y-5" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--pale-teal)' }}>
            <BookOpen size={20} style={{ color: 'var(--teal)' }} />
          </div>
          <div>
            <p className="font-semibold text-sm" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              Upload Brand Guide
            </p>
            <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
              Supports HTML or PDF · Max 10MB
            </p>
          </div>
        </div>

        {/* Brand name */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--mid-gray)' }}>
            Brand / Clinic Name
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="e.g. Sapphire Clinics East, Verdana Store…"
              className="flex-1 px-3 py-2.5 rounded-lg text-sm outline-none"
              style={{ border: '1.5px solid var(--light-gray)', color: 'var(--charcoal)' }}
            />
          </div>
          <div className="flex gap-2 mt-2 flex-wrap">
            {BRAND_PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setBrandName(p)}
                className="text-xs px-2.5 py-1 rounded-full"
                style={{
                  background: brandName === p ? 'var(--teal)' : 'var(--pale-teal)',
                  color: brandName === p ? '#fff' : 'var(--teal)',
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* File picker */}
        {file ? (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{ background: 'var(--pale-teal)' }}>
            <BookOpen size={18} style={{ color: 'var(--teal)' }} />
            <span className="text-sm flex-1" style={{ color: 'var(--charcoal)' }}>{file.name}</span>
            <button onClick={() => setFile(null)}>
              <X size={16} style={{ color: 'var(--mid-gray)' }} />
            </button>
          </div>
        ) : (
          <label
            className="flex flex-col items-center justify-center gap-3 px-6 py-10 rounded-xl cursor-pointer"
            style={{ border: '2px dashed var(--light-gray)', color: 'var(--mid-gray)' }}
          >
            <Upload size={30} />
            <div className="text-center">
              <p className="text-sm font-medium">Drop your brand guide here</p>
              <p className="text-xs mt-1">or click to browse files</p>
            </div>
            <input type="file" accept=".html,.htm,.pdf" className="hidden" onChange={handleFileChange} />
          </label>
        )}

        {error && (
          <p className="text-sm rounded-lg px-4 py-2.5" style={{ background: '#FEE2E2', color: '#DC2626' }}>
            {error}
          </p>
        )}

        <button
          onClick={uploadAndAnalyze}
          disabled={!file || uploading}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition-all"
          style={{
            background: file && !uploading ? 'var(--teal)' : 'var(--light-gray)',
            color: file && !uploading ? '#fff' : 'var(--mid-gray)',
            fontFamily: 'var(--font-display)',
          }}
        >
          <Sparkles size={15} />
          {uploading ? 'Uploading & Analyzing with AI…' : 'Upload & Analyze'}
        </button>

        <p className="text-xs text-center" style={{ color: 'var(--mid-gray)' }}>
          You can upload multiple brand guides — one per clinic. AI will use each guide's brand voice when generating content.
        </p>
      </div>

      {/* Analysis results */}
      {result && (
        <div className="rounded-xl p-6 space-y-5" style={{ background: '#fff', border: '1.5px solid var(--teal)' }}>
          <div className="flex items-center gap-2">
            <CheckCircle size={18} style={{ color: 'var(--teal)' }} />
            <h2 className="font-bold text-sm" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              {resultName ? `${resultName} — ` : ''}Brand Style Extracted
            </h2>
          </div>

          <div className="space-y-4">
            {result.colors.length > 0 && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--mid-gray)' }}>Colors</label>
                <div className="flex gap-3 mt-2 flex-wrap">
                  {result.colors.map((color) => (
                    <div key={color} className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full border" style={{ background: color, borderColor: 'var(--light-gray)' }} />
                      <span className="text-xs font-mono" style={{ color: 'var(--charcoal)' }}>{color}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.fonts.length > 0 && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--mid-gray)' }}>Typography</label>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {result.fonts.map((font) => (
                    <span key={font} className="text-xs px-3 py-1 rounded-full" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>
                      {font}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {result.tone && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--mid-gray)' }}>Brand Tone</label>
                <p className="text-sm mt-1" style={{ color: 'var(--charcoal)' }}>{result.tone}</p>
              </div>
            )}

            {result.styleNotes && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--mid-gray)' }}>Design Notes</label>
                <p className="text-sm mt-1" style={{ color: 'var(--charcoal)' }}>{result.styleNotes}</p>
              </div>
            )}
          </div>

          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
            This brand guide is now active and will be used when generating content for {resultName || 'this brand'}.
          </p>
        </div>
      )}
    </div>
  )
}
