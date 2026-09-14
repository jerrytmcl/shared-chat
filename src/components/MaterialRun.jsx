import { Icon } from './Icon'
import { Attachment } from './Attachment'
import { kindLabel, sourceMarksForItems } from '../lib/groupMessages'

function faviconUrl(host) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`
}

function SourceMark({ mark }) {
  if (mark.type === 'favicon' && mark.host) {
    return (
      <span className="source-mark source-favicon" title={mark.label}>
        <img
          src={faviconUrl(mark.host)}
          alt=""
          width="16"
          height="16"
          loading="lazy"
          decoding="async"
          onError={(e) => {
            e.currentTarget.remove()
            e.currentTarget.parentElement?.classList.add('source-favicon-fallback')
          }}
        />
        <Icon name="file" />
      </span>
    )
  }
  return (
    <span className="source-mark">
      <Icon name={mark.name || 'file'} />
    </span>
  )
}

/**
 * Expandable material-run card for consecutive attachment-only messages
 * from one author. UI grouping only — not a DB entity.
 * Optional title/summary overrides used by living package messages.
 */
export function MaterialRun({ items, onJump, result = false, title: titleProp, summary: summaryProp }) {
  const marks = sourceMarksForItems(items)
  const demo = items.every((m) => /^m[3-6]$/.test(m.id))
  const title =
    titleProp ||
    (demo
      ? 'Ideas for the camera move'
      : items.length === 1
        ? items[0].share?.title
        : `${items.length} things shared`)

  const counts = ['link', 'image', 'document', 'gif']
    .map((k) => {
      const n = items.filter((m) => m.share?.kind === k).length
      return n
        ? `${n} ${kindLabel(k).toLowerCase()}${n === 1 ? '' : 's'}`
        : null
    })
    .filter(Boolean)
    .join(' · ')

  const subtitle =
    summaryProp ||
    (demo
      ? items.length === 4
        ? 'Camera references, a setup screenshot, and timing notes.'
        : items
            .map((m) =>
              m.share?.kind === 'image' ? 'Setup screenshot' : m.share?.title
            )
            .join(' · ')
      : counts)

  return (
    <details className="material-run">
      <summary>
        <span className="source-stack" aria-hidden="true">
          {marks.map((mark, i) => (
            <SourceMark
              key={`${mark.type}-${mark.host || mark.name || mark.label}-${i}`}
              mark={mark}
            />
          ))}
        </span>
        <span className="run-copy">
          <strong>{title}</strong>
          <span>{subtitle}</span>
          {demo && !summaryProp && <small>{counts}</small>}
          {summaryProp && counts ? <small>{counts}</small> : null}
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
