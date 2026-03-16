'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Plus, CheckCircle, AlertCircle, RefreshCw, Calendar } from 'lucide-react'

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
      const res = await fetch('/api/social/post?status=PUBLISHED')
      const data = await res.json()
      setPosts(data.posts ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

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
            <PublishedCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  )
}

function PublishedCard({ post }: { post: Post }) {
  return (
    <div className="rounded-xl p-5 flex gap-4" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
      {post.imageUrl && (
        <img src={post.imageUrl} alt="" className="w-20 h-20 rounded-lg object-cover flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-4 mb-2">
          <p className="text-sm font-medium line-clamp-2" style={{ color: 'var(--charcoal)' }}>
            {post.content}
          </p>
          <span
            className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-semibold flex-shrink-0"
            style={{ background: '#D1FAE5', color: '#065F46' }}
          >
            <CheckCircle size={12} />
            Published
          </span>
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
            <span>Partial errors: {post.errorMsg}</span>
          </div>
        )}
      </div>
    </div>
  )
}
