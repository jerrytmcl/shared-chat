import { useState, useEffect, useRef } from 'react'
import { toPng } from 'html-to-image'
import { Icon } from './Icon'
import {
  getDiagnosticSnapshot,
  recentChatSlice,
} from '../lib/diagnostics'

const ISSUES_NEW = 'https://github.com/jerrytmcl/shared-chat/issues/new'
const APP_VERSION = 'shared-chat-0.1.0'

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function downloadJson(filename, data) {
  downloadBlob(
    filename,
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  )
}

/**
 * Note for next build → GitHub Issues + auto-downloaded context pack.
 * Capture bag is soft and will grow: note, who, time, version,
 * recent chat, UI screenshot, console errors, failed network calls.
 */
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
    setBusy(true)
    setError('')

    const id = crypto.randomUUID().slice(0, 8)
    const when = new Date().toISOString()
    const diag = getDiagnosticSnapshot()
    const chat = recentChatSlice(messages, 10)

    let screenshotDataUrl = null
    try {
      const root = document.getElementById('root')
      if (root) {
        screenshotDataUrl = await toPng(root, {
          cacheBust: true,
          pixelRatio: 1.5,
          filter: (node) => {
            if (!(node instanceof HTMLElement)) return true
            return !node.classList?.contains('design-note-dialog')
          },
        })
      }
    } catch (e) {
      setError(
        e?.message ||
          'Screenshot failed — still filing the note with other context.'
      )
    }

    const from = authedWho || who.trim() || 'unspecified'
    const packet = {
      id,
      appVersion: APP_VERSION,
      createdAt: when,
      from,
      authUserId: user?.id || null,
      thoughts: text,
      recentChat: chat,
      consoleErrors: diag.consoleErrors,
      networkFailures: diag.networkFailures,
      screenshotIncluded: Boolean(screenshotDataUrl),
    }

    downloadJson(`build-note-${id}.json`, packet)

    if (screenshotDataUrl) {
      const res = await fetch(screenshotDataUrl)
      downloadBlob(`build-note-${id}.png`, await res.blob())
    }

    const title = text.length > 72 ? text.slice(0, 69).trim() + '…' : text
    const body = [
      text,
      '',
      '---',
      `From: ${packet.from}`,
      `When: ${when}`,
      `App: ${APP_VERSION}`,
      '',
      '### Attach these downloads to this issue',
      `- \`build-note-${id}.json\` (chat slice, console errors, failed network)`,
      screenshotDataUrl
        ? `- \`build-note-${id}.png\` (auto UI screenshot)`
        : '- Screenshot capture failed in-browser',
      '',
      '### Recent chat (last 10)',
      '```json',
      JSON.stringify(chat, null, 2).slice(0, 3500),
      '```',
      '',
      '### Console errors',
      '```json',
      JSON.stringify(diag.consoleErrors.slice(-10), null, 2).slice(0, 2000),
      '```',
      '',
      '### Failed network',
      '```json',
      JSON.stringify(diag.networkFailures.slice(-10), null, 2).slice(0, 2000),
      '```',
      '',
      '_Filed via **Note for next build**_',
    ].join('\n')

    const url =
      ISSUES_NEW +
      '?title=' +
      encodeURIComponent(title) +
      '&body=' +
      encodeURIComponent(body.slice(0, 5500))

    window.open(url, '_blank', 'noopener,noreferrer')
    setBusy(false)
    onClose(
      'Downloaded context pack + opened GitHub issue — attach the files on the issue, then Submit.'
    )
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
        What’s broken, confusing, or worth keeping. Auto-grabs UI screenshot,
        recent chat, console errors, and failed network calls — then opens a
        GitHub issue for Jerry + Corey.
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
          {busy ? 'Capturing…' : 'File note'}
        </button>
      </div>
      <p className="search-note">
        Downloads a .png + .json, then opens GitHub. Drop those files onto the
        issue and hit Submit. Invite Corey as a collaborator on the private
        repo. ⌘/Ctrl+Enter works.
      </p>
    </dialog>
  )
}
