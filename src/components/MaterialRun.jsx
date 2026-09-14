import { useState, useCallback } from 'react'
import { Icon } from './Icon'
import { Lightbox } from './Lightbox'
import { useRunCopy } from '../hooks/useRunCopy'
import {
  hostnameFromUrl,
  shareDisplayLabel,
  shareSecondaryLine,
  sourceMarksForItems,
  kindLabel,
} from '../lib/groupMessages'

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

function RunLinkRow({ share, onJump, messageId, result }) {
  const href = share.href || share.url
  const host = href ? hostnameFromUrl(href) : ''
  const label = shareDisplayLabel(share)
  const secondary = shareSecondaryLine(share)
  const inner = (
    <>
      <span className="run-row-icon">
        {host ? (
          <img
            className="run-row-favicon"
            src={faviconUrl(host)}
            alt=""
            width="16"
            height="16"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        ) : (
          <Icon name="file" />
        )}
      </span>
      <span className="run-row-copy">
        <strong>{label}</strong>
        {secondary ? <small>{secondary}</small> : host ? <small>{host}</small> : null}
      </span>
      <Icon name="chevron" />
    </>
  )

  return (
    <div className="run-item" id={result ? undefined : messageId}>
      {href ? (
        <a className="run-row" href={href} target="_blank" rel="noreferrer">
          {inner}
        </a>
      ) : (
        <div className="run-row">{inner}</div>
      )}
      {result && (
        <button
          className="source-jump"
          type="button"
          onClick={() => onJump(messageId)}
        >
          Show in conversation <span aria-hidden="true">↗</span>
        </button>
      )}
    </div>
  )
}

function RunMediaRow({ share, onJump, messageId, result, onOpenLightbox }) {
  const src = share.url || share.href || null
  const label = shareDisplayLabel(share)

  return (
    <div className="run-item" id={result ? undefined : messageId}>
      <button
        type="button"
        className="run-row"
        onClick={() => {
          if (src) onOpenLightbox?.(src, label)
        }}
      >
        <span className="run-row-icon">
          {src ? (
            <img className="run-row-thumb" src={src} alt="" />
          ) : (
            <Icon name="camera" />
          )}
        </span>
        <span className="run-row-copy">
          <strong>{label}</strong>
          <small>{kindLabel(share.kind)}</small>
        </span>
        <Icon name="chevron" />
      </button>
      {result && (
        <button
          className="source-jump"
          type="button"
          onClick={() => onJump(messageId)}
        >
          Show in conversation <span aria-hidden="true">↗</span>
        </button>
      )}
    </div>
  )
}

function RunDocRow({ share, onJump, messageId, result }) {
  const href = share.url || share.href
  const label = shareDisplayLabel(share)
  const inner = (
    <>
      <span className="run-row-icon">
        <Icon name="file" />
      </span>
      <span className="run-row-copy">
        <strong>{label}</strong>
        <small>{kindLabel(share.kind || 'document')}</small>
      </span>
      <Icon name="chevron" />
    </>
  )

  return (
    <div className="run-item" id={result ? undefined : messageId}>
      {href ? (
        <a
          className="run-row"
          href={href}
          target="_blank"
          rel="noreferrer"
          download={share.title || undefined}
        >
          {inner}
        </a>
      ) : (
        <div className="run-row">{inner}</div>
      )}
      {result && (
        <button
          className="source-jump"
          type="button"
          onClick={() => onJump(messageId)}
        >
          Show in conversation <span aria-hidden="true">↗</span>
        </button>
      )}
    </div>
  )
}

function RunFlatRow({ message, onJump, result, onOpenLightbox }) {
  const share = message.share
  if (!share) return null
  const kind = share.kind || 'link'
  if (kind === 'image' || kind === 'gif') {
    return (
      <RunMediaRow
        share={share}
        messageId={message.id}
        onJump={onJump}
        result={result}
        onOpenLightbox={onOpenLightbox}
      />
    )
  }
  if (kind === 'document') {
    return (
      <RunDocRow
        share={share}
        messageId={message.id}
        onJump={onJump}
        result={result}
      />
    )
  }
  return (
    <RunLinkRow
      share={share}
      messageId={message.id}
      onJump={onJump}
      result={result}
    />
  )
}

/**
 * Expandable material-run card for consecutive attachment-only messages
 * from one author. UI grouping only — not a DB entity.
 * Optional title/summary overrides used by living package messages.
 * Expanded list is a flat row list (no Attachment accordion).
 * Images/GIFs open in an in-app lightbox (not a new tab).
 */
export function MaterialRun({
  items,
  onJump,
  result = false,
  title: titleProp,
  summary: summaryProp,
  timeLabel,
}) {
  const marks = sourceMarksForItems(items)
  const copy = useRunCopy(items, { enabled: titleProp == null })
  const title = titleProp || copy.title
  const subtitle = summaryProp || copy.summary
  const [lightbox, setLightbox] = useState(null)
  const openLightbox = useCallback((src, alt) => {
    if (src) setLightbox({ src, alt: alt || '' })
  }, [])
  const closeLightbox = useCallback(() => setLightbox(null), [])

  return (
    <>
      <div className="material-run-wrap">
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
            </span>
            <Icon name="chevron" />
          </summary>
          <div className="run-items">
            {items.map((m) => (
              <RunFlatRow
                key={m.id}
                message={m}
                onJump={onJump}
                result={result}
                onOpenLightbox={openLightbox}
              />
            ))}
          </div>
        </details>
        {timeLabel ? (
          <div className="card-time-row">
            <time className="card-time">{timeLabel}</time>
          </div>
        ) : null}
      </div>
      {lightbox && (
        <Lightbox src={lightbox.src} alt={lightbox.alt} onClose={closeLightbox} />
      )}
    </>
  )
}
