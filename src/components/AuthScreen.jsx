import { useState } from 'react'
import { Icon } from './Icon'

export function AuthScreen({
  onMagicLink,
  notice,
  isDemo,
  onEnterDemo,
}) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!email.trim()) return
    setBusy(true)
    await onMagicLink(email.trim())
    setBusy(false)
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="avatars">
            <i>J</i>
            <i>C</i>
          </span>
          <h1>Shared Chat</h1>
          <p className="muted">
            Private two-person conversation for Jerry &amp; Corey.
          </p>
        </div>

        {isDemo ? (
          <>
            <p className="auth-demo-note">
              Running in <strong>local demo mode</strong> — Supabase env is not
              configured. UI works with sample data; nothing is persisted.
            </p>
            <button className="primary auth-btn" type="button" onClick={onEnterDemo}>
              Enter demo conversation
            </button>
          </>
        ) : (
          <form onSubmit={submit} className="auth-form">
            <label htmlFor="email">Email magic link</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <button className="primary auth-btn" type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send magic link'}
            </button>
          </form>
        )}

        {notice && (
          <p className="auth-notice" role="status">
            {notice}
          </p>
        )}

        <p className="search-note">
          <Icon name="message" /> One conversation. Two people. No bots.
        </p>
      </div>
    </div>
  )
}
