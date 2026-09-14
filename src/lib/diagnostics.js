/** Ring buffers for build-note capture. Soft schema — grow over time. */

const MAX = 40
const consoleErrors = []
const networkFailures = []
let installed = false

function push(buf, item) {
  buf.push(item)
  if (buf.length > MAX) buf.shift()
}

export function installDiagnostics() {
  if (installed || typeof window === 'undefined') return
  installed = true

  const origError = console.error.bind(console)
  console.error = (...args) => {
    try {
      push(consoleErrors, {
        at: new Date().toISOString(),
        message: args
          .map((a) => {
            if (a instanceof Error) return a.stack || a.message
            try {
              return typeof a === 'string' ? a : JSON.stringify(a)
            } catch {
              return String(a)
            }
          })
          .join(' ')
          .slice(0, 2000),
      })
    } catch {
      /* ignore */
    }
    origError(...args)
  }

  window.addEventListener('error', (e) => {
    push(consoleErrors, {
      at: new Date().toISOString(),
      message: `${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`.slice(
        0,
        2000
      ),
    })
  })

  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason
    push(consoleErrors, {
      at: new Date().toISOString(),
      message: (r instanceof Error ? r.stack || r.message : String(r)).slice(
        0,
        2000
      ),
    })
  })

  const origFetch = window.fetch.bind(window)
  window.fetch = async (...args) => {
    const input = args[0]
    const url =
      typeof input === 'string'
        ? input
        : input && typeof input === 'object' && 'url' in input
          ? input.url
          : String(input)
    try {
      const res = await origFetch(...args)
      if (!res.ok) {
        push(networkFailures, {
          at: new Date().toISOString(),
          url: String(url).slice(0, 500),
          status: res.status,
          statusText: res.statusText,
        })
      }
      return res
    } catch (err) {
      push(networkFailures, {
        at: new Date().toISOString(),
        url: String(url).slice(0, 500),
        status: 0,
        statusText: err?.message || 'network error',
      })
      throw err
    }
  }
}

export function getDiagnosticSnapshot() {
  return {
    consoleErrors: [...consoleErrors],
    networkFailures: [...networkFailures],
  }
}

export function recentChatSlice(messages, n = 10) {
  return (messages || []).slice(-n).map((m) => ({
    id: m.id,
    at: m.created_at,
    from: m.author_name || m.author_id,
    kind: m.kind,
    text: (m.body || '').slice(0, 500),
    share: m.share
      ? {
          kind: m.share.kind,
          title: m.share.title,
          href: m.share.href || null,
        }
      : null,
  }))
}
