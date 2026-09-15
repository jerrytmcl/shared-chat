import { useState, useEffect, useRef } from 'react'
import { Icon } from './Icon'
import { supabase, CONVERSATION_ID } from '../lib/supabase'
import { formatTime, hostnameFromUrl } from '../lib/groupMessages'

function faviconUrl(host) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`
}

function decodeHtmlEntities(text) {
  const textArea = document.createElement('textarea')
  textArea.innerHTML = text
  return textArea.value
}

/**
 * Three-pane layout for focus rooms:
 * - Left: Return control
 * - Center: Focus thread (messages + composer)
 * - Right: Episode panel (title + materials)
 */
export function FocusThreePane({ roomId, onReturn, user }) {
  const [room, setRoom] = useState(null)
  const [shares, setShares] = useState([])
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const messagesEnd = useRef(null)

  useEffect(() => {
    if (!supabase || !roomId) return

    async function load() {
      setLoading(true)

      const { data: roomData } = await supabase
        .from('focus_rooms')
        .select('*')
        .eq('id', roomId)
        .single()

      if (roomData) setRoom(roomData)

      const { data: itemsData } = await supabase
        .from('focus_items')
        .select('share_id')
        .eq('focus_room_id', roomId)

      const shareIds = (itemsData || []).map((it) => it.share_id)

      if (shareIds.length > 0) {
        const { data: sharesData } = await supabase
          .from('original_shares')
          .select('*')
          .in('id', shareIds)

        if (sharesData) setShares(sharesData)
      }

      const { data: msgsData } = await supabase
        .from('focus_messages')
        .select('*')
        .eq('focus_room_id', roomId)
        .order('created_at', { ascending: true })

      if (msgsData) setMessages(msgsData)

      setLoading(false)
    }

    load()
  }, [roomId])

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(e) {
    e.preventDefault()
    if (!text.trim() || sending || !supabase) return

    setSending(true)

    const { data, error } = await supabase
      .from('focus_messages')
      .insert({
        focus_room_id: roomId,
        conversation_id: CONVERSATION_ID,
        author_id: user.id,
        body: text.trim(),
      })
      .select()
      .single()

    setSending(false)

    if (error) {
      console.error('focus message send failed', error)
      return
    }

    setMessages((prev) => [...prev, data])
    setText('')
  }

  if (loading) {
    return (
      <div className="focus-three-pane loading">
        <p>Loading focus room…</p>
      </div>
    )
  }

  if (!room) {
    return (
      <div className="focus-three-pane not-found">
        <p>Focus room not found</p>
        <button type="button" onClick={onReturn}>
          Back to Chat
        </button>
      </div>
    )
  }

  return (
    <div className="focus-three-pane">
      {/* Center: Focus thread */}
      <div className="focus-center-panel">
        <div className="focus-thread">
          <div className="focus-thread-header">
            <button
              type="button"
              className="focus-back-chip"
              onClick={onReturn}
              aria-label="Return to main chat"
            >
              <Icon name="arrow-left" />
              <span>Back to chat</span>
            </button>
          </div>
          
          <div className="focus-thread-messages">
            {messages.length === 0 && (
              <div className="focus-empty-state">
                <p>Share your thoughts about these materials</p>
              </div>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`focus-thread-message${msg.author_id === user.id ? ' is-mine' : ''}`}
              >
                <div className="focus-thread-bubble">{msg.body}</div>
                <div className="focus-thread-time">
                  {formatTime(msg.created_at)}
                </div>
              </div>
            ))}
            <div ref={messagesEnd} />
          </div>

          <form className="focus-thread-composer" onSubmit={sendMessage}>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Add to this focus…"
              disabled={sending}
            />
            <button type="submit" disabled={!text.trim() || sending}>
              <Icon name="send" />
            </button>
          </form>
        </div>
      </div>

      {/* Right: Episode panel */}
      <div className="focus-right-panel">
        <div className="focus-episode">
          <div className="focus-episode-header">
            <h2 className="focus-episode-title">{room.title}</h2>
            {room.summary && (
              <p className="focus-episode-summary">{room.summary}</p>
            )}
          </div>

          <div className="focus-episode-materials">
            <h3>Materials</h3>
            <div className="focus-materials-list">
              {shares.length === 0 && <p className="muted">No materials yet</p>}
              {shares.map((share) => {
                const href = share.href || share.url
                const host = href ? hostnameFromUrl(href) : ''
                const title = decodeHtmlEntities(share.title || 'Untitled')
                const description = share.description ? decodeHtmlEntities(share.description) : ''
                
                return (
                  <a
                    key={share.id}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="focus-material-card"
                  >
                    {host && (
                      <img
                        className="material-favicon"
                        src={faviconUrl(host)}
                        alt=""
                        width="16"
                        height="16"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                    )}
                    <div className="material-content">
                      <strong className="material-title">{title}</strong>
                      {description && (
                        <small className="material-description">{description}</small>
                      )}
                      {host && <small className="material-host">{host}</small>}
                    </div>
                    <Icon name="chevron" />
                  </a>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
