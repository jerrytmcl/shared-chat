import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { clearDebugLogs, subscribeDebugLogs } from '../lib/debugLog'

export function DebugLogPanel({ onClose }) {
  const [logs, setLogs] = useState([])

  useEffect(() => subscribeDebugLogs(setLogs), [])

  return (
    <dialog className="debug-log-dialog" open onCancel={(e) => { e.preventDefault(); onClose() }}>
      <div className="panel-heading">
        <h2>Suggest logs</h2>
        <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <p className="muted debug-log-help">
        Runs only after you send (not continuous). Shows schedule → request → Gemini steps → chip or skip.
      </p>
      <div className="debug-log-actions">
        <button type="button" className="plain-button" onClick={() => clearDebugLogs()}>
          Clear
        </button>
      </div>
      <div className="debug-log-list">
        {logs.length === 0 ? (
          <p className="muted">No entries yet. Send a message to trigger suggest.</p>
        ) : (
          [...logs].reverse().map((e) => (
            <article key={e.id} className="debug-log-entry">
              <time>{new Date(e.at).toLocaleTimeString()}</time>
              <strong>{e.message}</strong>
              {e.data != null && (
                <pre>{typeof e.data === 'string' ? e.data : JSON.stringify(e.data, null, 2)}</pre>
              )}
            </article>
          ))
        )}
      </div>
    </dialog>
  )
}
