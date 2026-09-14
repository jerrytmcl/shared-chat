import { useState, useEffect, useRef } from 'react'
import { Icon } from './Icon'

const VERSION = 'shared-chat-0.1.0'

export function Feedback({ context, onClose }) {
  const [thoughts, setThoughts] = useState('')
  const [shot, setShot] = useState(null)
  const [error, setError] = useState('')
  const [included, setIncluded] = useState(true)
  const dialog = useRef(null)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  async function screenshot() {
    setError('')
    let stream
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw Error(
          'Screen capture is unavailable in this browser. You can attach a screenshot instead.'
        )
      }
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      })
      const video = document.createElement('video')
      video.srcObject = stream
      await video.play()
      await new Promise((r) => requestAnimationFrame(r))
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d').drawImage(video, 0, 0)
      setShot(canvas.toDataURL('image/png'))
    } catch (e) {
      setError(
        e.name === 'NotAllowedError'
          ? 'Capture cancelled. You can try again or attach an image.'
          : e.message
      )
    } finally {
      stream?.getTracks().forEach((t) => t.stop())
    }
  }

  function file(e) {
    const f = e.target.files[0]
    if (!f) return
    if (f.size > 10e6) {
      setError('Please choose an image smaller than 10 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setShot(reader.result)
    reader.readAsDataURL(f)
  }

  function exportFeedback() {
    const packet = {
      id: crypto.randomUUID(),
      appVersion: VERSION,
      createdAt: new Date().toISOString(),
      thoughts,
      context: included ? context : null,
      screenshot: shot,
      delivery: { state: 'not-sent', destination: null },
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(packet, null, 2)], { type: 'application/json' })
    )
    const a = document.createElement('a')
    a.href = url
    a.download = `feedback-${packet.id}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    onClose('Feedback exported. Nothing has been sent.')
  }

  return (
    <dialog
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <div className="panel-heading">
        <h2>How did that feel?</h2>
        <button
          className="icon-button"
          aria-label="Close feedback"
          type="button"
          onClick={() => onClose()}
        >
          <Icon name="close" />
        </button>
      </div>
      <p className="muted">
        What happened, what you wanted, or something worth keeping.
      </p>
      <textarea
        aria-label="Your feedback"
        autoFocus
        value={thoughts}
        onChange={(e) => setThoughts(e.target.value)}
        placeholder="I was trying to…"
      />
      <label className="check">
        <input
          type="checkbox"
          checked={included}
          onChange={(e) => setIncluded(e.target.checked)}
        />
        Include this context
      </label>
      {included && (
        <details>
          <summary>
            {context?.message
              ? 'Selected message'
              : context?.search
                ? 'Search and results'
                : 'Current conversation'}
          </summary>
          <pre>{JSON.stringify(context, null, 2)}</pre>
        </details>
      )}
      <div className="capture-actions">
        <button type="button" onClick={screenshot}>
          <Icon name="camera" />
          Take a screenshot
        </button>
        <label className="file-label">
          Attach image
          <input type="file" accept="image/*" onChange={file} />
        </label>
      </div>
      {shot && (
        <div className="shot">
          <img src={shot} alt="Screenshot included in feedback" />
          <button
            className="plain-button"
            type="button"
            onClick={() => setShot(null)}
          >
            Remove screenshot
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <p className="search-note">
        Export the context and screenshot as a file. Delivery is not connected
        yet.
      </p>
      <button
        className="primary"
        type="button"
        disabled={!thoughts.trim()}
        onClick={exportFeedback}
      >
        Export feedback
      </button>
    </dialog>
  )
}
