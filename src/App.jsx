import { useState, useRef, useEffect } from 'react'
import { Icon } from './components/Icon'
import { MaterialRun } from './components/MaterialRun'
import { MessageReactions } from './components/MessageReactions'
import { SuggestionChip } from './components/SuggestionChip'
import { LivingPackage } from './components/LivingPackage'
import { SearchPanel } from './components/SearchPanel'
import { Feedback } from './components/Feedback'
import { DebugLogPanel } from './components/DebugLogPanel'
import { AuthScreen } from './components/AuthScreen'
import { useAuth } from './hooks/useAuth'
import { useMessages } from './hooks/useMessages'
import { groupMessages, formatTime } from './lib/groupMessages'
import './style.css'

export default function App() {
  const auth = useAuth()
  const [demoEntered, setDemoEntered] = useState(false)
  const signedIn = auth.isDemo ? demoEntered : Boolean(auth.user && auth.session)

  if (auth.loading) {
    return (
      <div className="auth-screen">
        <p className="muted">Loading…</p>
      </div>
    )
  }

  if (!signedIn) {
    return (
      <AuthScreen
        isDemo={auth.isDemo}
        notice={auth.authNotice}
        onMagicLink={auth.signInWithMagicLink}
        onEnterDemo={() => setDemoEntered(true)}
      />
    )
  }

  return <ChatShell auth={auth} />
}

function ChatShell({ auth }) {
  const { user, isDemo, signOut } = auth
  const {
    messages,
    setMessages,
    reactions,
    toggleReaction,
    notice,
    setNotice,
    sendText,
    sendFiles,
    materializePackage,
  } = useMessages(user)
  const [text, setText] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [buildNoteOpen, setBuildNoteOpen] = useState(false)
  const [logsOpen, setLogsOpen] = useState(false)
  const [search, setSearch] = useState(null)
  const [drag, setDrag] = useState(false)
  const [chipBusy, setChipBusy] = useState(false)
  const list = useRef(null)
  const file = useRef(null)
  const [toastVisible, setToastVisible] = useState(false)

  // Auto-dismiss notices above the composer (fade ~5s)
  useEffect(() => {
    if (!notice) {
      setToastVisible(false)
      return undefined
    }
    setToastVisible(true)
    const fadeTimer = setTimeout(() => setToastVisible(false), 4500)
    const clearTimer = setTimeout(() => setNotice(''), 5000)
    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(clearTimer)
    }
  }, [notice, setNotice])

  useEffect(() => {
    list.current?.scrollTo({
      top: list.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages.length])

  function jump(id) {
    const el = document.getElementById(id)
    if (el?.closest('details')) el.closest('details').open = true
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el?.classList.add('highlight')
    setTimeout(() => el?.classList.remove('highlight'), 1800)
  }

  function isOwn(m) {
    return m.author_id === user.id
  }

  const peerLabel =
    messages.find((m) => m.author_id !== user.id)?.author_name || 'Friend'

  function send(e) {
    e.preventDefault()
    const value = text.trim()
    if (!value) return
    sendText(value)
    setText('')
  }

  async function onShowChip(chipMessage) {
    if (chipBusy || chipMessage?.chip_payload?.accepted) return
    setChipBusy(true)
    try {
      await materializePackage(chipMessage)
    } finally {
      setChipBusy(false)
    }
  }

  return (
    <>
      <header>
        <div className="title">
          <span className="avatars">
            <i>{(peerLabel[0] || 'F').toUpperCase()}</i>
          </span>
          <h1>{peerLabel}</h1>
        </div>
        <nav>
          <button
            className={searchOpen ? 'active' : ''}
            type="button"
            onClick={() => setSearchOpen(!searchOpen)}
          >
            <Icon name="search" />
            Search
          </button>
          <button type="button" onClick={() => setBuildNoteOpen(true)}>
            Note for next build
          </button>
          <button type="button" onClick={() => setLogsOpen(true)}>
            Logs
          </button>
          {!isDemo && (
            <button type="button" onClick={signOut}>
              Sign out
            </button>
          )}
        </nav>
      </header>

      <main>
        <section
          className={`conversation ${drag ? 'dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setDrag(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            sendFiles(e.dataTransfer.files)
          }}
        >
          <div className="messages" ref={list}>
            <div className="message-width">
              <div className="day-divider">
                Today{' '}
                <span>
                  {formatTime(messages[0]?.created_at) ||
                    new Date().toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                </span>
              </div>
              {groupMessages(messages).map((m, index, groups) => {
                const isChip = !m.items && m.kind === 'chip'
                const isPackage = !m.items && m.kind === 'package'
                const own = isChip
                  ? false
                  : isOwn(m.items ? m.items[0] : m)
                const prev = groups[index - 1]
                const prevAuthor = prev?.items
                  ? prev.items[0].author_id
                  : prev?.kind === 'chip'
                    ? null
                    : prev?.author_id
                const authorId = m.items
                  ? m.items[0].author_id
                  : isChip
                    ? null
                    : m.author_id
                const continuation =
                  !isChip && prevAuthor != null && prevAuthor === authorId

                return (
                  <article
                    id={m.items ? `run-${m.id}` : m.id}
                    className={`message ${own ? 'own' : ''} ${continuation ? 'continuation' : ''} ${isChip ? 'is-chip' : ''} ${isPackage ? 'is-package' : ''}`}
                    key={m.id}
                  >
                    <div className="message-content">
                      {m.items ? (
                        <>
                          <MaterialRun
                            items={m.items}
                            timeLabel={formatTime(m.items[0]?.created_at)}
                          />
                          <MessageReactions
                            messageId={m.items[0]?.id}
                            reactions={reactions[m.items[0]?.id] || []}
                            currentUserId={user.id}
                            onToggle={(emoji) =>
                              toggleReaction(m.items[0]?.id, emoji)
                            }
                          />
                        </>
                      ) : isChip ? (
                        <>
                          <div className="card-with-time">
                            <SuggestionChip
                              message={m}
                              onShow={onShowChip}
                              busy={chipBusy}
                            />
                            <time className="run-time">
                              {formatTime(m.created_at)}
                            </time>
                          </div>
                          <MessageReactions
                            messageId={m.id}
                            reactions={reactions[m.id] || []}
                            currentUserId={user.id}
                            onToggle={(emoji) => toggleReaction(m.id, emoji)}
                          />
                        </>
                      ) : isPackage ? (
                        <>
                          <div className="card-with-time">
                            <LivingPackage message={m} />
                            <time className="run-time">
                              {formatTime(m.created_at)}
                            </time>
                          </div>
                          <MessageReactions
                            messageId={m.id}
                            reactions={reactions[m.id] || []}
                            currentUserId={user.id}
                            onToggle={(emoji) => toggleReaction(m.id, emoji)}
                          />
                        </>
                      ) : (
                        <>
                          {m.body && (
                            <p className="bubble">
                              {m.body}
                              <time className="bubble-time">
                                {formatTime(m.created_at)}
                              </time>
                            </p>
                          )}
                          {m.source_ids?.length > 0 && (
                            <details className="shared-results">
                              <summary>
                                {m.source_ids.length} sources · shared search
                              </summary>
                              {m.source_ids.map((id) => (
                                <button
                                  key={id}
                                  type="button"
                                  onClick={() => jump(id)}
                                >
                                  {messages.find((s) => s.id === id)?.share
                                    ?.title ||
                                    messages.find((s) => s.id === id)?.body}
                                </button>
                              ))}
                            </details>
                          )}
                          <MessageReactions
                            messageId={m.id}
                            reactions={reactions[m.id] || []}
                            currentUserId={user.id}
                            onToggle={(emoji) => toggleReaction(m.id, emoji)}
                          />
                        </>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          </div>

          {notice && (
            <div
              className={`composer-toast${toastVisible ? ' is-in' : ' is-out'}`}
              role="status"
            >
              {notice}
              <button
                type="button"
                onClick={() => setNotice('')}
                aria-label="Dismiss notice"
              >
                ×
              </button>
            </div>
          )}
          <form className="composer" onSubmit={send}>
            <input
              ref={file}
              type="file"
              multiple
              hidden
              accept="image/*,.gif,.pdf,.txt,.md,.doc,.docx,.csv"
              onChange={(e) => {
                sendFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <button
              type="button"
              className="attach-button"
              aria-label="Attach files"
              onClick={() => file.current.click()}
            >
              <Icon name="plus" />
            </button>
            <textarea
              aria-label="Message"
              rows="1"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={(e) => {
                if (e.clipboardData.files.length) {
                  sendFiles(e.clipboardData.files)
                }
              }}
              onKeyDown={(e) => {
                if (
                  e.key === 'Enter' &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault()
                  send(e)
                }
              }}
              placeholder="Message…"
            />
            <button
              className="primary send-button"
              aria-label="Send message"
              disabled={!text.trim()}
              type="submit"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <path d="M12 19V5m-6 6 6-6 6 6" />
              </svg>
            </button>
          </form>
          {drag && (
            <div className="drop-hint">Drop it into the conversation</div>
          )}
        </section>

        {searchOpen && (
          <SearchPanel
            messages={messages}
            onClose={() => setSearchOpen(false)}
            onSearch={setSearch}
            onJump={jump}
            onShare={(query, results) => {
              setMessages((ms) => [
                ...ms,
                {
                  id: crypto.randomUUID(),
                  author_id: user.id,
                  author_name: user.display_name || 'You',
                  kind: 'text',
                  body: `“${query}”`,
                  source_ids: results.map((r) => r.id),
                  share: null,
                  created_at: new Date().toISOString(),
                },
              ])
              setNotice('Search shared in conversation.')
            }}
          />
        )}
      </main>

      {buildNoteOpen && (
        <Feedback
          messages={messages}
          user={user}
          onClose={(message) => {
            setBuildNoteOpen(false)
            if (message) setNotice(message)
          }}
        />
      )}
      {logsOpen && <DebugLogPanel onClose={() => setLogsOpen(false)} />}
    </>
  )
}
