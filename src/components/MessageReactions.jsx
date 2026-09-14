import { useMemo, useState } from 'react'

const QUICK = ['👍', '❤️', '😂', '😮', '😢', '🔥']

/**
 * WhatsApp-ish reaction pills + hover picker.
 * Props: messageId, reactions [{id, emoji, user_id}], currentUserId, onToggle(emoji)
 */
export function MessageReactions({
  messageId,
  reactions = [],
  currentUserId,
  onToggle,
}) {
  const [open, setOpen] = useState(false)

  const aggregated = useMemo(() => {
    const map = new Map()
    for (const r of reactions || []) {
      if (!r?.emoji) continue
      const cur = map.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false }
      cur.count += 1
      if (currentUserId && r.user_id === currentUserId) cur.mine = true
      map.set(r.emoji, cur)
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji))
  }, [reactions, currentUserId])

  if (!messageId || !onToggle) return null

  return (
    <div
      className={`message-reactions${aggregated.length ? ' has-pills' : ' is-empty'}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false)
      }}
    >
      {aggregated.length > 0 && (
        <div className="reaction-pills" role="group" aria-label="Reactions">
          {aggregated.map((p) => (
            <button
              key={p.emoji}
              type="button"
              className={`reaction-pill${p.mine ? ' is-mine' : ''}`}
              aria-pressed={p.mine}
              onClick={() => onToggle(p.emoji)}
            >
              <span aria-hidden="true">{p.emoji}</span>
              <span className="reaction-count">{p.count}</span>
            </button>
          ))}
        </div>
      )}
      <div
        className={`reaction-picker${open ? ' is-visible' : ''}`}
        role="toolbar"
        aria-label="Add reaction"
      >
        {QUICK.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="reaction-pick"
            onClick={() => onToggle(emoji)}
            aria-label={`React ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
