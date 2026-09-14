import { Icon } from './Icon'
import { Attachment } from './Attachment'
import { kindLabel } from '../lib/groupMessages'

/**
 * Expandable material-run card for consecutive attachment-only messages
 * from one author. UI grouping only — not a DB entity.
 */
export function MaterialRun({ items, onJump, result = false }) {
  const kinds = [
    ...new Set(
      items.map((m) => m.share?.platform || kindLabel(m.share?.kind) || 'Link')
    ),
  ]
  const demo = items.every((m) => /^m[3-6]$/.test(m.id))
  const title = demo
    ? 'Ideas for the camera move'
    : items.length === 1
      ? items[0].share?.title
      : `${items.length} things shared`

  const counts = ['link', 'image', 'document', 'gif']
    .map((k) => {
      const n = items.filter((m) => m.share?.kind === k).length
      return n
        ? `${n} ${kindLabel(k).toLowerCase()}${n === 1 ? '' : 's'}`
        : null
    })
    .filter(Boolean)
    .join(' · ')

  return (
    <details className="material-run">
      <summary>
        <span className="source-stack" aria-hidden="true">
          {kinds.slice(0, 3).map((k) => (
            <span
              key={k}
              className={'source-mark ' + (k === 'X' ? 'source-x' : '')}
            >
              {k === 'X' ? (
                '𝕏'
              ) : (
                <Icon
                  name={
                    k === 'Image' || k === 'GIF' || k === 'image' || k === 'gif'
                      ? 'camera'
                      : 'file'
                  }
                />
              )}
            </span>
          ))}
        </span>
        <span className="run-copy">
          <strong>{title}</strong>
          <span>
            {demo
              ? items.length === 4
                ? 'Camera references, a setup screenshot, and timing notes.'
                : items
                    .map((m) =>
                      m.share?.kind === 'image'
                        ? 'Setup screenshot'
                        : m.share?.title
                    )
                    .join(' · ')
              : counts}
          </span>
          {demo && <small>{counts}</small>}
        </span>
        <Icon name="chevron" />
      </summary>
      <div className="run-items">
        {items.map((m) => (
          <div
            id={result ? undefined : m.id}
            className="run-item"
            key={m.id}
          >
            <div className="run-source">
              <Attachment item={m.share} />
              {result && (
                <button
                  className="source-jump"
                  type="button"
                  onClick={() => onJump(m.id)}
                >
                  Show in conversation <span aria-hidden="true">↗</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </details>
  )
}
