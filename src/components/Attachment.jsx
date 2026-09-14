import { useState, useCallback } from 'react'
import { Icon } from './Icon'
import { SampleImage } from './SampleImage'
import { Lightbox } from './Lightbox'
import { kindLabel } from '../lib/groupMessages'

export function Attachment({ item }) {
  const [expanded, setExpanded] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const closeLightbox = useCallback(() => setLightbox(null), [])

  if (!item) return null

  const kind = item.kind
  const isVisual = kind === 'image' || kind === 'gif'
  const src = item.url || item.href || null

  function toggle(e) {
    e.preventDefault()
    e.stopPropagation()
    // Images/GIFs open in lightbox instead of accordion expand / new tab
    if (isVisual && src) {
      setLightbox({ src, alt: item.title || '' })
      return
    }
    setExpanded((v) => !v)
  }

  return (
    <>
      <div className={`attachment${expanded ? ' is-expanded' : ''}`}>
        <button
          className="attachment-head"
          aria-expanded={isVisual ? undefined : expanded}
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
              {kindLabel(kind)} ·{' '}
              {isVisual ? 'view' : expanded ? 'hide' : 'expand'}
            </small>
          </span>
          <Icon name="chevron" />
        </button>
        {expanded && !isVisual && (
          <div className="attachment-body" onClick={(e) => e.stopPropagation()}>
            {item.description && <p>{item.description}</p>}
            {item.href && (
              <a href={item.href} target="_blank" rel="noreferrer">
                Open original link ↗
              </a>
            )}
            {item.url && (
              <a href={item.url} download={item.title}>
                Open original file ↓
              </a>
            )}
          </div>
        )}
      </div>
      {lightbox && (
        <Lightbox src={lightbox.src} alt={lightbox.alt} onClose={closeLightbox} />
      )}
    </>
  )
}
