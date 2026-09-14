import { useState } from 'react'
import { Icon } from './Icon'
import { SampleImage } from './SampleImage'
import { kindLabel } from '../lib/groupMessages'

export function Attachment({ item }) {
  const [expanded, setExpanded] = useState(false)
  if (!item) return null

  const kind = item.kind
  const isVisual = kind === 'image' || kind === 'gif'
  const src = item.url || item.href || null

  function toggle(e) {
    e.preventDefault()
    e.stopPropagation()
    setExpanded((v) => !v)
  }

  return (
    <div className={`attachment${expanded ? ' is-expanded' : ''}`}>
      <button
        className="attachment-head"
        aria-expanded={expanded}
        onClick={toggle}
        type="button"
      >
        {isVisual ? (
          src ? (
            <img className="thumb" src={src} alt="" />
          ) : (
            <SampleImage />
          )
        ) : (
          <span className="file-icon">
            <Icon name="file" />
          </span>
        )}
        <span className="attachment-label">
          <strong>{item.title}</strong>
          <small>
            {kindLabel(kind)} · {expanded ? 'hide' : 'expand'}
          </small>
        </span>
        <Icon name="chevron" />
      </button>
      {expanded && (
        <div className="attachment-body" onClick={(e) => e.stopPropagation()}>
          {isVisual && (
            <div className="media-expand">
              {src ? (
                <img className="full-image" src={src} alt={item.title || ''} />
              ) : (
                <SampleImage className="full-sample" />
              )}
            </div>
          )}
          {item.description && <p>{item.description}</p>}
          {item.href && (
            <a href={item.href} target="_blank" rel="noreferrer">
              Open original link ↗
            </a>
          )}
          {item.url && !isVisual && (
            <a href={item.url} download={item.title}>
              Open original file ↓
            </a>
          )}
        </div>
      )}
    </div>
  )
}
