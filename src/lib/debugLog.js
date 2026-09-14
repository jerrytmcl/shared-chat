/** In-app debug log for Jerry + Corey (suggest / Gemini trail). */
const MAX = 200
const entries = []
const listeners = new Set()

export function debugLog(message, data) {
  const entry = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    message: String(message),
    data: data === undefined ? null : data,
  }
  entries.push(entry)
  if (entries.length > MAX) entries.shift()
  try {
    if (data !== undefined) console.log('[shared-chat]', message, data)
    else console.log('[shared-chat]', message)
  } catch {
    /* ignore */
  }
  for (const fn of listeners) {
    try {
      fn(entries.slice())
    } catch {
      /* ignore */
    }
  }
  return entry
}

export function getDebugLogs() {
  return entries.slice()
}

export function clearDebugLogs() {
  entries.length = 0
  for (const fn of listeners) {
    try {
      fn([])
    } catch {
      /* ignore */
    }
  }
}

export function subscribeDebugLogs(fn) {
  listeners.add(fn)
  fn(entries.slice())
  return () => listeners.delete(fn)
}
