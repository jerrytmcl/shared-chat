import { useEffect, useMemo, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { runCardCopy, shareDisplayLabel, truncateAtWord } from '../lib/groupMessages'

const STORAGE_KEY = 'shared-chat:run-copy:v2'
const MAX_ENTRIES = 60

const cache = new Map()
const inflight = new Map()
let storageHydrated = false

function softSummary(text) {
  const s = String(text || '').trim()
  if (!s) return ''
  return truncateAtWord(s, 140)
}

/** Stable key: share ids only — survives refresh and minor enrich text tweaks. */
function idKeyItems(items) {
  return (items || [])
    .map((m) => m.share?.id || m.id || m.share?.href || '')
    .filter(Boolean)
    .sort()
    .join(',')
}

/** Content fingerprint — when this changes we revalidate in background. */
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

function hydrateFromStorage() {
  if (storageHydrated || typeof localStorage === 'undefined') return
  storageHydrated = true
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return
    for (const [key, value] of Object.entries(parsed)) {
      if (value?.title) cache.set(key, value)
    }
  } catch {
    /* ignore corrupt cache */
  }
}

function persistCache() {
  if (typeof localStorage === 'undefined') return
  try {
    const entries = [...cache.entries()]
    const trimmed = entries.slice(Math.max(0, entries.length - MAX_ENTRIES))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(trimmed)))
  } catch {
    /* quota / private mode */
  }
}

function remember(fp, ids, copy) {
  const entry = {
    ...copy,
    savedAt: Date.now(),
    contentFp: fp,
  }
  cache.set(fp, entry)
  if (ids) cache.set(`ids:${ids}`, entry)
  persistCache()
}

function lookup(fp, ids) {
  hydrateFromStorage()
  if (fp && cache.has(fp)) return { copy: cache.get(fp), exact: true }
  if (ids && cache.has(`ids:${ids}`)) return { copy: cache.get(`ids:${ids}`), exact: false }
  return { copy: null, exact: false }
}

hydrateFromStorage()

/**
 * Heuristic immediately; Gemini for n>=2.
 * Persists to localStorage so refresh does not regenerate.
 * Exact content hit → no network. Id-only hit → show stale, revalidate in background.
 */
export function useRunCopy(items, { enabled = true } = {}) {
  const list = Array.isArray(items) ? items : []
  const heuristic = useMemo(() => runCardCopy(list), [list])
  const fp = useMemo(() => fingerprintItems(list), [list])
  const ids = useMemo(() => idKeyItems(list), [list])

  const [remote, setRemote] = useState(() => {
    const { copy } = lookup(fp, ids)
    return copy
  })

  useEffect(() => {
    if (!enabled) {
      setRemote(null)
      return undefined
    }

    const hit = lookup(fp, ids)
    if (hit.copy) {
      setRemote(hit.copy)
      // Exact content match — skip Gemini entirely
      if (hit.exact) return undefined
    }

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
        remember(fp, ids, copy)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fp, ids, enabled])

  const hasGemini = Boolean(remote?.title)
  return {
    title: hasGemini ? remote.title : heuristic.title,
    summary: hasGemini ? remote.summary : softSummary(heuristic.summary),
    itemSummaries: remote?.itemSummaries || [],
  }
}
