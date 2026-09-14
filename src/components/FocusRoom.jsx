import { useState, useEffect, useRef } from 'react'
import { Icon } from './Icon'
import { Attachment } from './Attachment'
import { supabase, CONVERSATION_ID } from '../lib/supabase'
import { formatTime } from '../lib/groupMessages'

/**
 * Thin focus room UI: title, materials, message thread.
 * Episode of focus, not a permanent sidebar.
 */
export function FocusRoom({ roomId, onReturn, user }) {
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
      <div className="focus-room loading">
        <p>Loading focus room…</p>
      </div>
    )
  }

  if (!room) {
    return (
      <div className="focus-room not-found">
        <p>Focus room not found</p>
        <button type="button" onClick={onReturn}>
          Back to Chat
        </button>
      </div>
    )
  }

  return (
    <div className="focus-room">
      <header className="focus-room-header">
        <button
          type="button"
          className="focus-back-btn"
          onClick={onReturn}
          aria-label="Return to main chat"
        >
          <Icon name="arrow-left" />
        </button>
        <div className="focus-room-title">
          <h1>{room.title}</h1>
          {room.summary && <p className="focus-room-summary">{room.summary}</p>}
        </div>
      </header>

      <section className="focus-materials">
        <h2>Materials</h2>
        <div className="focus-materials-list">
          {shares.length === 0 && <p className="muted">No materials</p>}
          {shares.map((share) => (
            <div key={share.id} className="focus-material-card">
              <Attachment share={share} compact />
            </div>
          ))}
        </div>
      </section>

      <section className="focus-messages">
        <div className="focus-messages-list">
          {messages.length === 0 && (
            <p className="muted">Start the conversation</p>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`focus-message${msg.author_id === user.id ? ' is-mine' : ''}`}
            >
              <div className="focus-message-body">{msg.body}</div>
              <div className="focus-message-meta">
                {formatTime(msg.created_at)}
              </div>
            </div>
          ))}
          <div ref={messagesEnd} />
        </div>

        <form className="focus-composer" onSubmit={sendMessage}>
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
      </section>
    </div>
  )
}
