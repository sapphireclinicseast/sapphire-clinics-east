'use client'

import { useEffect, useRef, useState } from 'react'
import { sanitizeHtml, bodyLooksLikeHtml, plainTextToHtml } from '@/lib/announcement-html'

interface Props {
  /** Current HTML value. Can be plain text (will be converted) or
   *  already-sanitized HTML. */
  value: string
  /** Fires whenever the editor's current HTML changes. Already sanitized. */
  onChange: (html: string) => void
  /** Placeholder shown when the editor is empty. */
  placeholder?: string
  disabled?: boolean
  /** Minimum editor body height in pixels. */
  minHeight?: number
}

type CmdName = 'bold' | 'italic' | 'underline' | 'strikeThrough'
  | 'insertUnorderedList' | 'insertOrderedList' | 'removeFormat'

interface Btn { cmd: CmdName; label: string; title: string; style?: React.CSSProperties }

const BUTTONS: Btn[] = [
  { cmd: 'bold',          label: 'B',  title: 'Bold (Cmd/Ctrl + B)',  style: { fontWeight: 700 } },
  { cmd: 'italic',        label: 'I',  title: 'Italic (Cmd/Ctrl + I)', style: { fontStyle: 'italic' } },
  { cmd: 'underline',     label: 'U',  title: 'Underline (Cmd/Ctrl + U)', style: { textDecoration: 'underline' } },
  { cmd: 'strikeThrough', label: 'S',  title: 'Strikethrough', style: { textDecoration: 'line-through' } },
]

const LIST_BUTTONS: Btn[] = [
  { cmd: 'insertUnorderedList', label: '• List', title: 'Bulleted list' },
  { cmd: 'insertOrderedList',   label: '1. List', title: 'Numbered list' },
]

/**
 * Lightweight rich-text editor for the announcement composer.
 *
 * Chose contentEditable + document.execCommand over a framework (TipTap /
 * Lexical / ProseMirror) for three reasons:
 *   1. Zero new dependencies — class-portal has only 8 deps today and
 *      we don't want to bloat the bundle for a composer only staff see.
 *   2. The required feature set is tiny: bold / italic / underline /
 *      strikethrough / bullet list / numbered list / link / clear
 *      formatting. execCommand handles all of these natively in every
 *      browser we support, and the deprecation notice has yet to
 *      actually remove it anywhere.
 *   3. Output is well-structured inline HTML that round-trips through
 *      our allowlist sanitizer cleanly.
 *
 * The editor is uncontrolled internally (the DOM owns the content)
 * but exposes an onChange callback that fires after each keystroke
 * with the sanitized innerHTML. Parent should store that string and
 * send it back as `value` only when the external state resets (e.g.
 * after a successful publish).
 */
export default function RichTextEditor({ value, onChange, placeholder, disabled, minHeight = 160 }: Props) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  // Last value we emitted via onChange. Any value prop that doesn't
  // match this is treated as an external reset (e.g. parent clearing
  // the form after publish) — only then do we overwrite innerHTML.
  // This avoids clobbering the caret during typing.
  const lastEmittedRef = useRef<string>('')
  const [isEmpty, setIsEmpty] = useState(true)
  const [linkPromptOpen, setLinkPromptOpen] = useState(false)

  useEffect(() => {
    if (!editorRef.current) return
    if (value === lastEmittedRef.current) return // typing round-trip, do nothing
    const next = value
      ? (bodyLooksLikeHtml(value) ? sanitizeHtml(value) : plainTextToHtml(value))
      : ''
    editorRef.current.innerHTML = next
    lastEmittedRef.current = next
    setIsEmpty(!editorRef.current.textContent?.trim())
  }, [value])

  function fireChange() {
    if (!editorRef.current) return
    const raw = editorRef.current.innerHTML
    const clean = sanitizeHtml(raw)
    lastEmittedRef.current = clean
    setIsEmpty(!editorRef.current.textContent?.trim())
    onChange(clean)
  }

  function exec(cmd: CmdName) {
    if (disabled) return
    editorRef.current?.focus()
    try {
      // execCommand is deprecated per MDN but still implemented in
      // every browser — and is the simplest way to apply a format to
      // the current selection without reaching for a framework.
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      document.execCommand(cmd)
    } catch { /* older browsers may throw; swallow */ }
    fireChange()
  }

  function execInsertLink(url: string) {
    if (disabled) return
    editorRef.current?.focus()
    const trimmed = url.trim()
    if (!trimmed) { setLinkPromptOpen(false); return }
    // If the user typed a bare domain, add https:// so execCommand
    // treats it as absolute.
    const normalized = /^(https?:|mailto:|tel:|\/)/i.test(trimmed) ? trimmed : `https://${trimmed}`
    try {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      document.execCommand('createLink', false, normalized)
    } catch { /* ignore */ }
    setLinkPromptOpen(false)
    fireChange()
  }

  function execUnlink() {
    if (disabled) return
    editorRef.current?.focus()
    try {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      document.execCommand('unlink')
    } catch { /* ignore */ }
    fireChange()
  }

  /** Flatten pasted HTML so that pasting from Word / Google Docs
   *  doesn't carry inline styles, Office MSO tags, or large images.
   *  We intercept the paste event, grab the plain text, and insert
   *  it as a text node — any formatting the user wanted, they can
   *  re-apply with the toolbar. */
  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    if (!text) return
    try {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      document.execCommand('insertText', false, text)
    } catch {
      // Fallback: insert as text node at caret.
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0)
        range.deleteContents()
        range.insertNode(document.createTextNode(text))
        range.collapse(false)
      }
    }
    fireChange()
  }

  return (
    <div
      className="rte"
      style={{
        border: '1px solid var(--paper-3)',
        borderRadius: 10,
        background: '#fff',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <div
        role="toolbar"
        aria-label="Formatting"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          padding: '6px 8px',
          borderBottom: '1px solid var(--paper-3)',
          background: 'var(--paper-2)',
          borderTopLeftRadius: 10,
          borderTopRightRadius: 10,
        }}
      >
        {BUTTONS.map(b => (
          <ToolbarBtn key={b.cmd} title={b.title} onClick={() => exec(b.cmd)} style={b.style} disabled={disabled}>
            {b.label}
          </ToolbarBtn>
        ))}
        <span style={{ width: 1, background: 'var(--paper-3)', margin: '0 4px' }} aria-hidden />
        {LIST_BUTTONS.map(b => (
          <ToolbarBtn key={b.cmd} title={b.title} onClick={() => exec(b.cmd)} disabled={disabled}>
            {b.label}
          </ToolbarBtn>
        ))}
        <span style={{ width: 1, background: 'var(--paper-3)', margin: '0 4px' }} aria-hidden />
        <ToolbarBtn title="Insert link" onClick={() => setLinkPromptOpen(true)} disabled={disabled}>🔗 Link</ToolbarBtn>
        <ToolbarBtn title="Remove link" onClick={execUnlink} disabled={disabled}>⌧</ToolbarBtn>
        <ToolbarBtn title="Clear formatting" onClick={() => exec('removeFormat')} disabled={disabled}>Clear</ToolbarBtn>
      </div>

      {linkPromptOpen && (
        <LinkPrompt
          onCancel={() => setLinkPromptOpen(false)}
          onConfirm={execInsertLink}
        />
      )}

      <div style={{ position: 'relative' }}>
        <div
          ref={editorRef}
          className="rte-body"
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={fireChange}
          onBlur={fireChange}
          onPaste={handlePaste}
          style={{
            minHeight,
            padding: '10px 12px',
            fontSize: 14.5,
            lineHeight: 1.55,
            color: 'var(--ink, #0f172a)',
            outline: 'none',
          }}
          data-empty={isEmpty ? 'true' : 'false'}
        />
        {isEmpty && placeholder && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: 10, left: 12, right: 12,
              color: 'var(--mid-gray, #94a3b8)',
              pointerEvents: 'none',
              fontSize: 14.5,
              lineHeight: 1.55,
            }}
          >
            {placeholder}
          </div>
        )}
      </div>
      <style>{`
        .rte-body ul, .rte-body ol { margin: 0.3em 0 0.3em 1.4em; }
        .rte-body li { margin: 0.1em 0; }
        .rte-body p { margin: 0 0 0.5em; }
        .rte-body p:last-child { margin-bottom: 0; }
        .rte-body a { color: var(--sage, #16a34a); text-decoration: underline; }
      `}</style>
    </div>
  )
}

function ToolbarBtn({
  children, title, onClick, style, disabled,
}: {
  children: React.ReactNode
  title: string
  onClick: () => void
  style?: React.CSSProperties
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={e => { e.preventDefault(); /* keep selection */ }}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 30,
        height: 28,
        padding: '0 7px',
        fontSize: 13,
        fontFamily: 'inherit',
        background: '#fff',
        color: 'var(--ink, #0f172a)',
        border: '1px solid var(--paper-3)',
        borderRadius: 6,
        cursor: disabled ? 'default' : 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

/** Small inline "Enter URL" prompt — avoids window.prompt() which looks
 *  jarring in the modal and can be blocked by some browsers. */
function LinkPrompt({ onConfirm, onCancel }: { onConfirm: (url: string) => void; onCancel: () => void }) {
  const [url, setUrl] = useState('')
  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        padding: '8px 10px',
        borderBottom: '1px solid var(--paper-3)',
        background: '#fffbe6',
      }}
    >
      <input
        autoFocus
        type="url"
        value={url}
        onChange={e => setUrl(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); onConfirm(url) }
          if (e.key === 'Escape') { e.preventDefault(); onCancel() }
        }}
        placeholder="https://example.com or email@example.com"
        style={{
          flex: 1,
          fontSize: 13,
          padding: '5px 8px',
          borderRadius: 6,
          border: '1px solid var(--paper-3)',
          background: '#fff',
        }}
      />
      <button
        type="button"
        onClick={() => onConfirm(url)}
        style={{
          fontSize: 12,
          padding: '5px 10px',
          borderRadius: 6,
          background: 'var(--sage, #16a34a)',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        Insert
      </button>
      <button
        type="button"
        onClick={onCancel}
        style={{
          fontSize: 12,
          padding: '5px 10px',
          borderRadius: 6,
          background: '#fff',
          color: 'var(--ink, #0f172a)',
          border: '1px solid var(--paper-3)',
          cursor: 'pointer',
        }}
      >
        Cancel
      </button>
    </div>
  )
}

