import { useEffect, useMemo, useRef, useState } from 'react'

const QUICK = ['👍', '❤️', '😂', '😮', '😢', '🔥']

/**
 * WhatsApp-style reactions:
 * - Smile trigger on hover (outside bubble)
 * - Picker opens from trigger click only
 * - Pills only when someone has reacted
 */
export function MessageReactions({
  messageId,
  reactions = [],
  currentUserId,
  onToggle,
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const rootRef = useRef(null)

  const aggregated = useMemo(() => {
    const map = new Map()
    for (const r of reactions || []) {
      if (!r?.emoji) continue
      const cur = map.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false }
      cur.count += 1
      if (currentUserId && r.user_id === currentUserId) cur.mine = true
      map.set(r.emoji, cur)
    }
    return [...map.values()].sort(
      (a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji)
    )
  }, [reactions, currentUserId])

  useEffect(() => {
    if (!pickerOpen) return undefined
    function onDoc(e) {
      if (!rootRef.current?.contains(e.target)) setPickerOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setPickerOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [pickerOpen])

  if (!messageId || !onToggle) return null

  return (
    <div
      ref={rootRef}
      className={`message-reactions${aggregated.length ? ' has-pills' : ''}${pickerOpen ? ' is-open' : ''}`}
      onMouseLeave={() => setPickerOpen(false)}
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
      <button
        type="button"
        className={`react-trigger${pickerOpen ? ' is-open' : ''}`}
        aria-label="React"
        aria-expanded={pickerOpen}
        onClick={(e) => {
          e.stopPropagation()
          setPickerOpen((v) => !v)
        }}
      >
        😊
      </button>
      {pickerOpen && (
        <div className="reaction-picker" role="toolbar" aria-label="Add reaction">
          {QUICK.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="reaction-pick"
              onClick={() => {
                onToggle(emoji)
                setPickerOpen(false)
              }}
              aria-label={`React ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
