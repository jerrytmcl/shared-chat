import { useEffect, useState, useRef } from 'react'
import { Icon } from './Icon'
import { clearDebugLogs, subscribeDebugLogs } from '../lib/debugLog'

export function DebugLogPanel({ onClose }) {
  const [logs, setLogs] = useState([])
  const [copied, setCopied] = useState(false)
  const dialog = useRef(null)

  useEffect(() => subscribeDebugLogs(setLogs), [])

  useEffect(() => {
    const el = dialog.current
    if (!el) return undefined
    if (typeof el.showModal === 'function') {
      try {
        el.showModal()
      } catch {
        el.setAttribute('open', '')
      }
    } else {
      el.setAttribute('open', '')
    }
    return () => {
      if (typeof el.close === 'function') {
        try {
          el.close()
        } catch {
          /* ignore */
        }
      }
    }
  }, [])

  const handleCopy = async () => {
    if (logs.length === 0) return
    
    // Build plain text log output (chronological order, oldest first)
    const logText = [...logs]
      .reverse()
      .map((e) => {
        const time = new Date(e.at).toLocaleTimeString()
        const data = e.data != null 
          ? (typeof e.data === 'string' ? e.data : JSON.stringify(e.data, null, 2))
          : ''
        return `${time} ${e.message}${data ? '\n' + data : ''}`
      })
      .join('\n\n')
    
    try {
      await navigator.clipboard.writeText(logText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1000)
    } catch (err) {
      console.error('Failed to copy logs:', err)
    }
  }

  return (
    <dialog
      ref={dialog}
      className="debug-log-dialog"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <div className="panel-heading">
        <h2>Suggest logs</h2>
        <button
          className="icon-button"
          type="button"
          aria-label="Close"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      <p className="muted debug-log-help">
        Runs only after you send (not continuous). Shows schedule → request →
        Gemini steps → chip or skip.
      </p>
      <div className="debug-log-actions">
        <button
          type="button"
          className="plain-button"
          onClick={handleCopy}
          disabled={logs.length === 0}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          type="button"
          className="plain-button"
          onClick={() => clearDebugLogs()}
        >
          Clear
        </button>
      </div>
      <div className="debug-log-list">
        {logs.length === 0 ? (
          <p className="muted">
            No entries yet. Send a message to trigger suggest.
          </p>
        ) : (
          [...logs].reverse().map((e) => (
            <article key={e.id} className="debug-log-entry">
              <time>{new Date(e.at).toLocaleTimeString()}</time>
              <strong>{e.message}</strong>
              {e.data != null && (
                <pre>
                  {typeof e.data === 'string'
                    ? e.data
                    : JSON.stringify(e.data, null, 2)}
                </pre>
              )}
            </article>
          ))
        )}
      </div>
    </dialog>
  )
}
