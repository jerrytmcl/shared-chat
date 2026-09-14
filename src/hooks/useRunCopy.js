import { useEffect, useMemo, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { runCardCopy, shareDisplayLabel, truncateAtWord } from '../lib/groupMessages'

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

function softSummary(text) {
  const s = String(text || '').trim()
  if (!s) return ''
  // Prefer complete words — never mid-clause hard cut
  return truncateAtWord(s, 140)
}

/**
 * Heuristic immediately; for n>=2 fire Gemini /api/run-copy right away.
 * While a new fingerprint is loading, keep prior Gemini copy (no "4 links" flash).
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
    // Keep stale Gemini until the new one lands — do NOT clear to heuristic
    if (list.length < 2 || !fp) return undefined
    if (!isSupabaseConfigured || !supabase) return undefined

    let cancelled = false

    const run = async () => {
      if (inflight.has(fp)) {
        try {
          const result = await inflight.get(fp)
          if (!cancelled && result) setRemote(result)
        } catch {
          /* ignore */
        }
        return
      }

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
        if (!data?.title || data.method !== 'gemini') return null
        const itemSummaries = Array.isArray(data.itemSummaries)
          ? data.itemSummaries.map((s) => String(s || '').trim().slice(0, 110))
          : []
        const copy = {
          title: String(data.title).slice(0, 52),
          summary: softSummary(data.summary || ''),
          itemSummaries,
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
    }

    run()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fingerprint drives refresh
  }, [fp, enabled])

  const hasGemini = Boolean(remote?.title)
  return {
    title: hasGemini ? remote.title : heuristic.title,
    summary: hasGemini ? remote.summary : softSummary(heuristic.summary),
    itemSummaries: remote?.itemSummaries || [],
  }
}
