'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Plus, Clock, AlertCircle, RefreshCw, Send, Trash2,
  CheckCircle, Calendar, List, ChevronLeft, ChevronRight,
} from 'lucide-react'

const PLATFORM_COLORS: Record<string, string> = {
  FACEBOOK: '#1877F2',
  INSTAGRAM: '#E1306C',
  TIKTOK: '#000000',
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  SCHEDULED: { bg: '#E8F0EE', text: '#2E5E5A', label: 'Scheduled' },
  PUBLISHED: { bg: '#D1FAE5', text: '#065F46', label: 'Published' },
  DRAFT: { bg: '#F3F4F6', text: '#6B7280', label: 'Draft' },
  FAILED: { bg: '#FEE2E2', text: '#DC2626', label: 'Failed' },
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function formatDateTime(d: string | Date) {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function formatTime(d: string | Date) {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })
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

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export default function ScheduledPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [allPosts, setAllPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState<string | null>(null)
  const [toasts, setToasts] = useState<{ id: string; msg: string; ok: boolean }[]>([])
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [calMonth, setCalMonth] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/social/post')
      const data = await res.json()
      const all: Post[] = data.posts ?? []
      setAllPosts(all)
      setPosts(all.filter((p: Post) => p.status !== 'PUBLISHED'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const addToast = (msg: string, ok: boolean) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, msg, ok }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000)
  }

  const deletePost = async (postId: string) => {
    if (!confirm('Delete this post? This cannot be undone.')) return
    try {
      await fetch(`/api/social/post?id=${postId}`, { method: 'DELETE' })
      load()
    } catch {
      addToast('Failed to delete post.', false)
    }
  }

  const publishNow = async (postId: string) => {
    setPublishing(postId)
    try {
      const res = await fetch('/api/social/post/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId }),
      })
      const data = await res.json()
      if (!res.ok) {
        addToast(`Failed: ${data.error}`, false)
      } else {
        addToast(`Published to ${data.publishedIds?.length ?? 0} account(s)!`, true)
        load()
      }
    } catch {
      addToast('Network error — please try again.', false)
    } finally {
      setPublishing(null)
    }
  }

  // ── Calendar helpers ──────────────────────────────────────────────────────
  const year = calMonth.getFullYear()
  const month = calMonth.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date()

  // Build grid cells (leading empty + days)
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null)

  function postsForDay(day: number) {
    const d = new Date(year, month, day)
    return allPosts.filter((p) => isSameDay(new Date(p.scheduledAt), d))
  }

  const selectedDayPosts = selectedDay
    ? allPosts.filter((p) => isSameDay(new Date(p.scheduledAt), selectedDay))
    : []

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl space-y-6">
      {/* Toast stack */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm text-white"
            style={{ background: t.ok ? '#065F46' : '#DC2626', minWidth: 260 }}>
            {t.ok ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            {t.msg}
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>
            Social Media
          </p>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            Scheduled Posts
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--light-gray)' }}>
            <button
              onClick={() => setView('list')}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors"
              style={{ background: view === 'list' ? 'var(--teal)' : '#fff', color: view === 'list' ? '#fff' : 'var(--mid-gray)' }}
            >
              <List size={14} /> List
            </button>
            <button
              onClick={() => setView('calendar')}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors"
              style={{ background: view === 'calendar' ? 'var(--teal)' : '#fff', color: view === 'calendar' ? '#fff' : 'var(--mid-gray)' }}
            >
              <Calendar size={14} /> Calendar
            </button>
          </div>
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border"
            style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)', background: '#fff' }}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <Link href="/social/compose" className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--teal)', color: '#fff', fontFamily: 'var(--font-display)' }}>
            <Plus size={16} /> New Post
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm" style={{ color: 'var(--mid-gray)' }}>Loading posts…</div>
      ) : view === 'list' ? (
        /* ── LIST VIEW ──────────────────────────────────────────────────── */
        posts.length === 0 ? (
          <div className="rounded-xl p-12 flex flex-col items-center text-center"
            style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
            <Clock size={40} style={{ color: 'var(--mid-gray)' }} className="mb-4" />
            <p className="font-semibold mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>No posts scheduled</p>
            <p className="text-sm mb-4" style={{ color: 'var(--mid-gray)' }}>Create your first post to get started</p>
            <Link href="/social/compose" className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--teal)', color: '#fff' }}>
              Create Post
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => <PostCard key={post.id} post={post} publishing={publishing} onPublish={publishNow} onDelete={deletePost} />)}
          </div>
        )
      ) : (
        /* ── CALENDAR VIEW ──────────────────────────────────────────────── */
        <div className="space-y-4">
          {/* Month nav */}
          <div className="flex items-center justify-between">
            <button onClick={() => { setCalMonth(new Date(year, month - 1, 1)); setSelectedDay(null) }}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors" style={{ color: 'var(--mid-gray)' }}>
              <ChevronLeft size={18} />
            </button>
            <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              {MONTHS[month]} {year}
            </h2>
            <button onClick={() => { setCalMonth(new Date(year, month + 1, 1)); setSelectedDay(null) }}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors" style={{ color: 'var(--mid-gray)' }}>
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Calendar grid */}
          <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
            {/* Day headers */}
            <div className="grid grid-cols-7">
              {DAYS.map((d) => (
                <div key={d} className="py-2 text-center text-xs font-semibold uppercase tracking-widest"
                  style={{ color: 'var(--mid-gray)', borderBottom: '1px solid var(--light-gray)' }}>
                  {d}
                </div>
              ))}
            </div>
            {/* Day cells */}
            <div className="grid grid-cols-7">
              {cells.map((day, i) => {
                if (!day) return <div key={i} className="min-h-20 p-1" style={{ borderBottom: '1px solid #f5f5f5', borderRight: '1px solid #f5f5f5' }} />
                const dayPosts = postsForDay(day)
                const cellDate = new Date(year, month, day)
                const isToday = isSameDay(cellDate, today)
                const isSelected = selectedDay ? isSameDay(cellDate, selectedDay) : false
                return (
                  <div
                    key={i}
                    onClick={() => setSelectedDay(isSelected ? null : cellDate)}
                    className="min-h-20 p-1.5 cursor-pointer transition-colors"
                    style={{
                      borderBottom: '1px solid #f5f5f5',
                      borderRight: '1px solid #f5f5f5',
                      background: isSelected ? 'var(--pale-teal)' : 'transparent',
                    }}
                  >
                    <div
                      className="w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold mb-1"
                      style={{
                        background: isToday ? 'var(--teal)' : 'transparent',
                        color: isToday ? '#fff' : 'var(--charcoal)',
                        fontFamily: 'var(--font-display)',
                      }}
                    >
                      {day}
                    </div>
                    <div className="space-y-0.5">
                      {dayPosts.slice(0, 3).map((p) => (
                        <div
                          key={p.id}
                          className="text-xs px-1.5 py-0.5 rounded truncate"
                          style={{
                            background: STATUS_STYLES[p.status]?.bg ?? '#f5f5f5',
                            color: STATUS_STYLES[p.status]?.text ?? '#666',
                            fontSize: '0.65rem',
                          }}
                        >
                          {formatTime(p.scheduledAt)} · {p.platforms[0]}
                        </div>
                      ))}
                      {dayPosts.length > 3 && (
                        <div className="text-xs" style={{ color: 'var(--mid-gray)', fontSize: '0.65rem' }}>
                          +{dayPosts.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Selected day detail */}
          {selectedDay && (
            <div className="rounded-xl p-5 space-y-3" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
              <h3 className="font-bold text-sm" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                {selectedDay.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </h3>
              {selectedDayPosts.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>No posts on this day.</p>
              ) : (
                <div className="space-y-2">
                  {selectedDayPosts.map((p) => <PostCard key={p.id} post={p} publishing={publishing} onPublish={publishNow} onDelete={deletePost} />)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PostCard({ post, publishing, onPublish, onDelete }: { post: Post; publishing: string | null; onPublish: (id: string) => void; onDelete: (id: string) => void }) {
  const style = STATUS_STYLES[post.status] ?? STATUS_STYLES.DRAFT
  const isPublishing = publishing === post.id
  const canPublish = post.status === 'SCHEDULED' || post.status === 'FAILED'

  return (
    <div className="rounded-xl p-5 flex gap-4" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
      {post.imageUrl && (
        <img src={post.imageUrl} alt="" className="w-20 h-20 rounded-lg object-cover flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-4 mb-2">
          <p className="text-sm font-medium line-clamp-2" style={{ color: 'var(--charcoal)' }}>{post.content}</p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs px-2 py-1 rounded-full font-semibold" style={{ background: style.bg, color: style.text }}>
              {style.label}
            </span>
            {canPublish && (
              <button onClick={() => onPublish(post.id)} disabled={isPublishing}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold transition-opacity disabled:opacity-60"
                style={{ background: 'var(--teal)', color: '#fff' }}>
                {isPublishing ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
                {isPublishing ? 'Publishing…' : 'Publish Now'}
              </button>
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
            {post.scheduledAt ? (() => {
              const d = new Date(post.scheduledAt)
              return d.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
            })() : 'No date set'}
          </span>
          {post.platforms.map((p) => (
            <span key={p} className="text-xs px-2 py-0.5 rounded font-semibold"
              style={{ background: `${PLATFORM_COLORS[p]}18`, color: PLATFORM_COLORS[p] }}>
              {p}
            </span>
          ))}
          <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>by {post.createdBy.name}</span>
        </div>
        {post.errorMsg && (
          <div className="flex items-start gap-1.5 mt-2 text-xs" style={{ color: '#DC2626' }}>
            <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
            <span>{post.errorMsg}</span>
          </div>
        )}
        {post.accountIds.length === 0 && post.status === 'SCHEDULED' && (
          <div className="flex items-center gap-1.5 mt-1 text-xs" style={{ color: '#D97706' }}>
            <AlertCircle size={12} />
            No specific accounts selected — will post to all {post.platforms.join('/')} accounts
          </div>
        )}
      </div>
    </div>
  )
}
