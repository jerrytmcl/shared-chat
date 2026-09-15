/**
 * Slim quiet suggestion card in the right gutter.
 * No layout push — floats over the chat.
 */
export function FocusGutterWhisper({ suggestion, onOpen, onDismiss, busy = false }) {
  const title = suggestion.title || 'Focus Room'
  const reason = suggestion.reason || 'Materials ready for focused attention'
  const count = suggestion.shareIds?.length || 0

  return (
    <div className="focus-gutter-whisper">
      <div className="whisper-header">
        <svg
          width="14"
          height="14"
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
        <span className="whisper-label">Focus suggestion</span>
        <button
          type="button"
          className="whisper-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss suggestion"
          disabled={busy}
        >
          ×
        </button>
      </div>
      <div className="whisper-body">
        <strong className="whisper-title">{title}</strong>
        <p className="whisper-reason">{reason}</p>
        {count > 0 && (
          <span className="whisper-count">
            {count} material{count === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <button
        type="button"
        className="whisper-open-btn"
        onClick={onOpen}
        disabled={busy}
      >
        {busy ? 'Opening…' : 'Open'}
      </button>
    </div>
  )
}
