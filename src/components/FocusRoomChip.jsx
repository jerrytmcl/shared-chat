/**
 * Focus room suggestion chip — distinct from package suggestions.
 * Appears after material piles settle. Episode framing.
 */
export function FocusRoomChip({ suggestion, onAccept, busy = false }) {
  const title = suggestion.title || 'Focus Room'
  const reason = suggestion.reason || 'Materials ready for focused attention'

  return (
    <div className="focus-room-chip">
      <div className="focus-chip-header">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="8" cy="8" r="6" />
          <circle cx="8" cy="8" r="2" fill="currentColor" />
        </svg>
        <span>Open a focus room?</span>
      </div>
      <div className="focus-chip-body">
        <strong>{title}</strong>
        <p>{reason}</p>
      </div>
      <button
        type="button"
        className="focus-chip-accept"
        onClick={onAccept}
        disabled={busy}
      >
        {busy ? 'Creating…' : 'Open Focus Room'}
      </button>
    </div>
  )
}
