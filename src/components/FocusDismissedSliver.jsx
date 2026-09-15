/**
 * Thin recoverable sliver for dismissed focus suggestions.
 * Appears in the main chat timeline.
 */
export function FocusDismissedSliver({ dismissed, onRestore }) {
  const title = dismissed.title || 'Focus Room'
  const count = dismissed.shareIds?.length || 0

  return (
    <button
      type="button"
      className="focus-dismissed-sliver"
      onClick={onRestore}
      aria-label={`Restore focus suggestion: ${title}`}
    >
      <svg
        width="12"
        height="12"
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
      <span className="sliver-text">
        {title}
        {count > 0 && ` · ${count} material${count === 1 ? '' : 's'}`}
      </span>
      <span className="sliver-hint">Tap to restore</span>
    </button>
  )
}
