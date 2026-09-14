/**
 * Compact timeline suggestion chip (kind=chip).
 * Quiet — not a chatty persona. Tap → materialize living package.
 */
export function SuggestionChip({ message, onShow, busy = false }) {
  const payload = message.chip_payload || {}
  const title = payload.title || message.body || 'Suggested package'
  const summary = payload.summary || ''
  const accepted = Boolean(payload.accepted)
  const count = Array.isArray(payload.shareIds) ? payload.shareIds.length : 0

  return (
    <button
      type="button"
      className={`suggestion-chip${accepted ? ' is-accepted' : ''}`}
      onClick={() => onShow?.(message)}
      disabled={busy || accepted}
      aria-label={accepted ? `${title} (opened)` : `Show package: ${title}`}
    >
      <span className="chip-copy">
        <strong>{title}</strong>
        {summary ? <span>{summary}</span> : null}
        {count > 0 && !summary ? (
          <span>
            {count} saved item{count === 1 ? '' : 's'}
          </span>
        ) : null}
      </span>
      <span className="chip-action">{accepted ? 'Opened' : 'Show package'}</span>
    </button>
  )
}
