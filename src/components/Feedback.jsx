import { useState, useEffect, useRef } from 'react'
import { toPng } from 'html-to-image'
import { Icon } from './Icon'
import {
  getDiagnosticSnapshot,
  recentChatSlice,
} from '../lib/diagnostics'
import {
  supabase,
  isSupabaseConfigured,
  CONVERSATION_ID,
  STORAGE_BUCKET,
} from '../lib/supabase'

const APP_VERSION = 'shared-chat-0.1.0'

function identityFromUser(user) {
  if (!user) return null
  const name = (user.display_name || user.user_metadata?.full_name || '').trim()
  const email = (user.email || '').trim()
  if (name && email) return `${name} <${email}>`
  if (name) return name
  if (email) return email
  if (user.id) return String(user.id)
  return null
}

function dataUrlToBlob(dataUrl) {
  const [header, b64] = dataUrl.split(',')
  const mime = /data:(.*?);/.exec(header)?.[1] || 'image/png'
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/**
 * Note for next build → Supabase build_notes (+ screenshot in chat-media).
 * Capture bag is soft and will grow.
 */
export function Feedback({ messages = [], user = null, onClose }) {
  const authedWho = identityFromUser(user)
  const [thoughts, setThoughts] = useState('')
  const [who, setWho] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dialog = useRef(null)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  async function submit() {
    const text = thoughts.trim()
    if (!text || busy) return
    if (!isSupabaseConfigured || !supabase || !user?.id) {
      setError('Sign in to file a build note.')
      return
    }
    setBusy(true)
    setError('')

    const when = new Date().toISOString()
    const diag = getDiagnosticSnapshot()
    const chat = recentChatSlice(messages, 10)
    const from = authedWho || who.trim() || 'unspecified'

    let screenshotPath = null
    try {
      const root = document.getElementById('root')
      if (root) {
        const dataUrl = await toPng(root, {
          cacheBust: true,
          pixelRatio: 1.5,
          filter: (node) => {
            if (!(node instanceof HTMLElement)) return true
            return !node.classList?.contains('design-note-dialog')
          },
        })
        const blob = dataUrlToBlob(dataUrl)
        const path = `build-notes/${user.id}/${Date.now()}.png`
        const { error: upErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(path, blob, { contentType: 'image/png', upsert: false })
        if (upErr) {
          setError(`Screenshot upload failed: ${upErr.message}`)
        } else {
          screenshotPath = path
        }
      }
    } catch (e) {
      setError(
        e?.message ||
          'Screenshot failed — still filing the note with other context.'
      )
    }

    const { error: insertErr } = await supabase.from('build_notes').insert({
      conversation_id: CONVERSATION_ID,
      author_id: user.id,
      author_label: from,
      thoughts: text,
      app_version: APP_VERSION,
      screenshot_path: screenshotPath,
      recent_chat: chat,
      console_errors: diag.consoleErrors,
      network_failures: diag.networkFailures,
      context: { filedAt: when },
    })

    setBusy(false)
    if (insertErr) {
      setError(`Could not save note: ${insertErr.message}`)
      return
    }
    onClose('Build note saved. Jerry & Chatty can pick it up from Supabase.')
  }

  return (
    <dialog
      ref={dialog}
      className="design-note-dialog"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <div className="panel-heading">
        <h2>Note for next build</h2>
        <button
          className="icon-button"
          aria-label="Close"
          type="button"
          onClick={() => onClose()}
        >
          <Icon name="close" />
        </button>
      </div>
      <p className="muted">
        What’s broken, confusing, or worth keeping. Saves screenshot, recent
        chat, console errors, and failed network calls to Supabase for Jerry +
        Corey.
      </p>
      {authedWho ? (
        <p className="note-who-stamped muted">
          Filing as <strong>{authedWho}</strong>
        </p>
      ) : (
        <label className="note-who">
          <span>Your name</span>
          <input
            value={who}
            onChange={(e) => setWho(e.target.value)}
            placeholder="Jerry or Corey"
            autoComplete="nickname"
          />
        </label>
      )}
      <textarea
        aria-label="Note for next build"
        autoFocus
        value={thoughts}
        onChange={(e) => setThoughts(e.target.value)}
        placeholder="e.g. Photos still don’t expand when I upload my own…"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            submit()
          }
        }}
      />
      {error && <p role="alert">{error}</p>}
      <div className="design-note-actions">
        <button
          className="primary"
          type="button"
          disabled={!thoughts.trim() || busy || (!authedWho && !who.trim())}
          onClick={submit}
        >
          {busy ? 'Saving…' : 'Save note'}
        </button>
      </div>
      <p className="search-note">
        One click — no downloads. Notes land in the <code>build_notes</code>{' '}
        table. ⌘/Ctrl+Enter works.
      </p>
    </dialog>
  )
}
