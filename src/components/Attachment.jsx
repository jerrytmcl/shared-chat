import { useState } from 'react'
import { Icon } from './Icon'
import { SampleImage } from './SampleImage'
import { kindLabel } from '../lib/groupMessages'

export function Attachment({ item }) {
  const [expanded, setExpanded] = useState(false)
  const kind = item.kind
  const isVisual = kind === 'image' || kind === 'gif'

  return (
    <div className="attachment">
      <button
        className="attachment-head"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
        {isVisual ? (
          item.url ? (
            <img className="thumb" src={item.url} alt="Uploaded preview" />
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
            {kindLabel(kind)} · {expanded ? 'hide details' : 'details'}
          </small>
        </span>
        <Icon name="chevron" />
      </button>
      {expanded && (
        <div className="attachment-body">
          {item.url && isVisual && (
            <img className="full-image" src={item.url} alt={item.title} />
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
