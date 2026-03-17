'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Plus, CheckCircle, AlertCircle, RefreshCw, Calendar, Trash2, RotateCcw, X } from 'lucide-react'

const PLATFORM_COLORS: Record<string, string> = {
  FACEBOOK: '#1877F2',
  INSTAGRAM: '#E1306C',
  TIKTOK: '#000000',
}

interface Post {
  id: string
  content: string
  imageUrl: string | null
  platforms: string[]
  accountIds: string[]
  scheduledAt: string
  status: string
  errorMsg: string | null
  publishedId: string | null
  createdBy: { name: string }
}

function formatDateTime(d: string | Date) {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

export default function PublishedPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [pubRes, failRes] = await Promise.all([
        fetch('/api/social/post?status=PUBLISHED'),
        fetch('/api/social/post?status=FAILED'),
      ])
      const [pubData, failData] = await Promise.all([pubRes.json(), failRes.json()])
      const all = [...(failData.posts ?? []), ...(pubData.posts ?? [])]
      // Sort: FAILED first, then by date descending
      all.sort((a: Post, b: Post) => {
        if (a.status === 'FAILED' && b.status !== 'FAILED') return -1
        if (a.status !== 'FAILED' && b.status === 'FAILED') return 1
        return new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
      })
      setPosts(all)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const deletePost = async (postId: string) => {
    if (!confirm('Delete this post record? This cannot be undone.')) return
    await fetch(`/api/social/post?id=${postId}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>
            Social Media
          </p>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            Published Posts
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border"
            style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)', background: '#fff' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <Link
            href="/social/compose"
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--teal)', color: '#fff', fontFamily: 'var(--font-display)' }}
          >
            <Plus size={16} /> New Post
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm" style={{ color: 'var(--mid-gray)' }}>Loading posts…</div>
      ) : posts.length === 0 ? (
        <div
          className="rounded-xl p-12 flex flex-col items-center text-center"
          style={{ background: '#fff', border: '1px solid var(--light-gray)' }}
        >
          <Calendar size={40} style={{ color: 'var(--mid-gray)' }} className="mb-4" />
          <p className="font-semibold mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            No published posts yet
          </p>
          <p className="text-sm mb-4" style={{ color: 'var(--mid-gray)' }}>
            Published posts will appear here once they go live
          </p>
          <Link
            href="/social/scheduled"
            className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--teal)', color: '#fff' }}
          >
            View Scheduled Posts
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <PublishedCard key={post.id} post={post} onDelete={deletePost} onReload={load} />
          ))}
        </div>
      )}
    </div>
  )
}

function PublishedCard({ post, onDelete, onReload }: { post: Post; onDelete: (id: string) => void; onReload: () => void }) {
  const [showRepost, setShowRepost] = useState(false)
  const [reposting, setReposting] = useState(false)
  const [repostMsg, setRepostMsg] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const isFailed = post.status === 'FAILED'
  const hasError = !!post.errorMsg

  // Determine which platforms failed (for smart defaults)
  const failedPlatforms: string[] = []
  if (post.errorMsg) {
    if (post.errorMsg.includes('INSTAGRAM') || post.errorMsg.includes('Instagram')) failedPlatforms.push('INSTAGRAM')
    if (post.errorMsg.includes('FACEBOOK') || post.errorMsg.includes('Facebook')) failedPlatforms.push('FACEBOOK')
  }
  if (isFailed && failedPlatforms.length === 0) {
    // Fully failed — default to all platforms
    failedPlatforms.push(...post.platforms)
  }

  const repost = async (platforms: string[]) => {
    setReposting(true)
    setRepostMsg(null)
    try {
      const res = await fetch('/api/social/post/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: post.id, platforms }),
      })
      const data = await res.json()
      if (!res.ok) {
        setRepostMsg(`Failed: ${data.error ?? 'Unknown error'}`)
      } else {
        setRepostMsg(`Reposted to ${platforms.join(', ')}`)
        setShowRepost(false)
        onReload()
      }
    } catch (err) {
      setRepostMsg(`Error: ${err instanceof Error ? err.message : 'Unknown'}`)
    } finally {
      setReposting(false)
    }
  }

  return (
    <div
      className="rounded-xl p-5 flex gap-4"
      style={{
        background: isFailed ? '#FFF7ED' : '#fff',
        border: `1px solid ${isFailed ? '#FDBA74' : 'var(--light-gray)'}`,
      }}
    >
      {post.imageUrl && (
        <img src={post.imageUrl} alt="" className="w-20 h-20 rounded-lg object-cover flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-4 mb-2">
          <p className="text-sm font-medium line-clamp-2" style={{ color: 'var(--charcoal)' }}>
            {post.content}
          </p>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isFailed ? (
              <span
                className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-semibold"
                style={{ background: '#FEE2E2', color: '#DC2626' }}
              >
                <AlertCircle size={12} />
                Failed
              </span>
            ) : (
              <span
                className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-semibold"
                style={{ background: '#D1FAE5', color: '#065F46' }}
              >
                <CheckCircle size={12} />
                Published
              </span>
            )}

            {/* Repost button — shown for failed posts or posts with partial errors */}
            {(isFailed || hasError) && (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setShowRepost(!showRepost)}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-semibold"
                  style={{ background: '#DBEAFE', color: '#1D4ED8' }}
                  disabled={reposting}
                >
                  <RotateCcw size={12} className={reposting ? 'animate-spin' : ''} />
                  Repost
                </button>
                {showRepost && (
                  <div
                    className="absolute right-0 top-full mt-1 z-50 rounded-lg shadow-lg p-3 min-w-[180px]"
                    style={{ background: '#fff', border: '1px solid var(--light-gray)' }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>Repost to:</span>
                      <button onClick={() => setShowRepost(false)}>
                        <X size={12} style={{ color: 'var(--mid-gray)' }} />
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {post.platforms.includes('FACEBOOK') && (
                        <button
                          onClick={() => repost(['FACEBOOK'])}
                          disabled={reposting}
                          className="w-full text-left text-xs px-3 py-2 rounded-md font-medium hover:opacity-80 transition-opacity"
                          style={{ background: '#1877F218', color: '#1877F2' }}
                        >
                          Facebook only
                        </button>
                      )}
                      {post.platforms.includes('INSTAGRAM') && (
                        <button
                          onClick={() => repost(['INSTAGRAM'])}
                          disabled={reposting}
                          className="w-full text-left text-xs px-3 py-2 rounded-md font-medium hover:opacity-80 transition-opacity"
                          style={{ background: '#E1306C18', color: '#E1306C' }}
                        >
                          Instagram only
                        </button>
                      )}
                      {post.platforms.length > 1 && (
                        <button
                          onClick={() => repost(post.platforms)}
                          disabled={reposting}
                          className="w-full text-left text-xs px-3 py-2 rounded-md font-medium hover:opacity-80 transition-opacity"
                          style={{ background: 'var(--teal)', color: '#fff' }}
                        >
                          All platforms
                        </button>
                      )}
                    </div>
                    {repostMsg && (
                      <p className="text-xs mt-2" style={{ color: repostMsg.startsWith('Failed') ? '#DC2626' : '#059669' }}>
                        {repostMsg}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <button onClick={() => onDelete(post.id)}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-semibold"
              style={{ background: '#FEE2E2', color: '#DC2626' }}
              title="Delete post">
              <Trash2 size={12} />
              Delete
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>
            {formatDateTime(post.scheduledAt)}
          </span>
          {post.platforms.map((p) => (
            <span
              key={p}
              className="text-xs px-2 py-0.5 rounded font-semibold"
              style={{ background: `${PLATFORM_COLORS[p]}18`, color: PLATFORM_COLORS[p] }}
            >
              {p}
            </span>
          ))}
          <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>
            by {post.createdBy.name}
          </span>
        </div>

        {post.publishedId && (
          <p className="text-xs mt-1.5 font-mono" style={{ color: 'var(--mid-gray)' }}>
            IDs: {post.publishedId}
          </p>
        )}

        {post.errorMsg && (
          <div className="flex items-start gap-1.5 mt-2 text-xs" style={{ color: '#D97706' }}>
            <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
            <span>{isFailed ? 'Error' : 'Partial errors'}: {post.errorMsg}</span>
          </div>
        )}
      </div>
    </div>
  )
}
