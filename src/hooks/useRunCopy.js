import { useEffect, useMemo, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { runCardCopy, shareDisplayLabel } from '../lib/groupMessages'

const cache = new Map()
const inflight = new Map()

/** Fingerprint includes titles+descriptions so enrich triggers a Gemini re-run. */
function fingerprintItems(items) {
  return (items || [])
    .map((m) => {
      const s = m.share
      if (!s) return m.id || ''
      const id = s.id || s.href || m.id || ''
      const t = String(s.title || '').slice(0, 48)
      const d = String(s.description || '').slice(0, 120)
      return `${id}::${t}::${d}`
    })
    .filter(Boolean)
    .join('|')
}

/**
 * Heuristic immediately; for n>=2 debounce Gemini /api/run-copy and cache by fingerprint.
 * titleProp/summaryProp still win at the call site.
 */
export function useRunCopy(items, { enabled = true } = {}) {
  const list = Array.isArray(items) ? items : []
  const heuristic = useMemo(() => runCardCopy(list), [list])
  const fp = useMemo(() => fingerprintItems(list), [list])
  const [remote, setRemote] = useState(() => (fp && cache.has(fp) ? cache.get(fp) : null))

  useEffect(() => {
    if (!enabled) {
      setRemote(null)
      return undefined
    }
    if (fp && cache.has(fp)) {
      setRemote(cache.get(fp))
      return undefined
    }
    setRemote(null)
    if (list.length < 2 || !fp) return undefined
    if (!isSupabaseConfigured || !supabase) return undefined

    let cancelled = false
    const timer = setTimeout(async () => {
      if (inflight.has(fp)) {
        try {
          const result = await inflight.get(fp)
          if (!cancelled && result) setRemote(result)
        } catch {
          /* ignore */
        }
        return
      }

      // Send description heavily so Gemini can theme from tweet/article text
      const payloadItems = list.map((m) => ({
        title: shareDisplayLabel(m.share) || m.share?.title || '',
        description: String(m.share?.description || '').slice(0, 200),
        kind: m.share?.kind || 'link',
        href: m.share?.href || m.share?.url || null,
        platform: m.share?.platform || null,
        byline: m.share?.byline || m.share?.metadata?.byline || null,
      }))

      const promise = (async () => {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData?.session?.access_token
        if (!token) return null
        const resp = await fetch('/api/run-copy', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ items: payloadItems }),
        })
        if (!resp.ok) return null
        const data = await resp.json()
        // Only cache real Gemini copy — heuristic fallbacks must retry next visit
        if (!data?.title || data.method !== 'gemini') return null
        const copy = {
          title: String(data.title).slice(0, 52),
          summary: String(data.summary || '').slice(0, 90),
        }
        cache.set(fp, copy)
        return copy
      })()

      inflight.set(fp, promise)
      try {
        const result = await promise
        if (!cancelled && result) setRemote(result)
      } catch {
        /* best-effort */
      } finally {
        inflight.delete(fp)
      }
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fingerprint drives refresh
  }, [fp, enabled])

  return {
    title: remote?.title || heuristic.title,
    summary: remote?.summary || heuristic.summary,
  }
}
