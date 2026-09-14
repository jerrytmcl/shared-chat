import { useEffect } from 'react'

/**
 * In-app image/GIF lightbox — dark overlay, Esc / backdrop / X to close.
 */
export function Lightbox({ src, alt = '', onClose }) {
  useEffect(() => {
    if (!src) return undefined
    function onKey(e) {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [src, onClose])

  if (!src) return null

  return (
    <div
      className="lightbox-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={alt || 'Image preview'}
      onClick={onClose}
    >
      <button
        type="button"
        className="lightbox-close"
        aria-label="Close"
        onClick={(e) => {
          e.stopPropagation()
          onClose?.()
        }}
      >
        ×
      </button>
      <img
        className="lightbox-image"
        src={src}
        alt={alt || ''}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}
