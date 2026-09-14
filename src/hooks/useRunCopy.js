import { useEffect, useMemo, useState } from 'react'
import {
  supabase,
  isSupabaseConfigured,
  CONVERSATION_ID,
} from '../lib/supabase'
import { runCardCopy, shareDisplayLabel, truncateAtWord } from '../lib/groupMessages'

const LOCAL_KEY = 'shared-chat:run-copy:v3'
const MAX_LOCAL = 60

const mem = new Map()
const inflight = new Map()

function softSummary(text) {
  const s = String(text || '').trim()
  if (!s) return ''
  return truncateAtWord(s, 140)
}

function idKeyItems(items) {
  return (items || [])
    .map((m) => m.share?.id || m.id || m.share?.href || '')
    .filter(Boolean)
    .sort()
    .join(',')
}

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

function rowFromDb(row) {
  if (!row?.title) return null
  return {
    title: String(row.title).slice(0, 52),
    summary: softSummary(row.summary || ''),
    itemSummaries: Array.isArray(row.item_summaries)
      ? row.item_summaries.map((s) => String(s || '').trim().slice(0, 110))
      : [],
    contentFp: row.content_fp || '',
    updatedAt: row.updated_at ? Date.parse(row.updated_at) : Date.now(),
  }
}

function readLocal(ids) {
  if (typeof localStorage === 'undefined' || !ids) return null
  try {
    const all = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}')
    const hit = all[ids]
    return hit?.title ? hit : null
  } catch {
    return null
  }
}

function writeLocal(ids, copy) {
  if (typeof localStorage === 'undefined' || !ids || !copy?.title) return
  try {
    const all = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}')
    all[ids] = { ...copy, savedAt: Date.now() }
    const keys = Object.keys(all)
    if (keys.length > MAX_LOCAL) {
      keys
        .sort((a, b) => (all[a].savedAt || 0) - (all[b].savedAt || 0))
        .slice(0, keys.length - MAX_LOCAL)
        .forEach((k) => delete all[k])
    }
    localStorage.setItem(LOCAL_KEY, JSON.stringify(all))
  } catch {
    /* ignore */
  }
}

async function fetchShared(ids) {
  if (!supabase || !ids) return null
  const { data, error } = await supabase
    .from('run_copy_cache')
    .select('title, summary, item_summaries, content_fp, updated_at')
    .eq('conversation_id', CONVERSATION_ID)
    .eq('share_ids_key', ids)
    .maybeSingle()
  if (error) {
    console.warn('run_copy_cache read', error.message)
    return null
  }
  return rowFromDb(data)
}

async function saveShared(ids, fp, copy) {
  if (!supabase || !ids || !copy?.title) return
  const payload = {
    conversation_id: CONVERSATION_ID,
    share_ids_key: ids,
    content_fp: fp || '',
    title: copy.title,
    summary: copy.summary || '',
    item_summaries: copy.itemSummaries || [],
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase
    .from('run_copy_cache')
    .upsert(payload, { onConflict: 'conversation_id,share_ids_key' })
  if (error) console.warn('run_copy_cache write', error.message)
  else {
    const remembered = { ...copy, contentFp: fp, updatedAt: Date.now() }
    mem.set(ids, remembered)
    writeLocal(ids, remembered)
  }
}

/**
 * Shared Gemini pile copy via Supabase (Jerry + Corey).
 * localStorage is only a fast paint hint; Supabase is source of truth.
 */
export function useRunCopy(items, { enabled = true } = {}) {
  const list = Array.isArray(items) ? items : []
  const heuristic = useMemo(() => runCardCopy(list), [list])
  const fp = useMemo(() => fingerprintItems(list), [list])
  const ids = useMemo(() => idKeyItems(list), [list])

  const [remote, setRemote] = useState(() => {
    if (!ids) return null
    return mem.get(ids) || readLocal(ids)
  })

  useEffect(() => {
    if (!enabled) {
      setRemote(null)
      return undefined
    }
    if (list.length < 2 || !ids) return undefined
    if (!isSupabaseConfigured || !supabase) return undefined

    let cancelled = false

    const apply = (copy) => {
      if (!cancelled && copy?.title) {
        mem.set(ids, copy)
        writeLocal(ids, copy)
        setRemote(copy)
      }
    }

    const needGemini = async (existing) => {
      // Exact content match in shared cache → done
      if (existing?.contentFp && existing.contentFp === fp) return false
      return true
    }

    const runGemini = async () => {
      if (inflight.has(fp)) {
        try {
          const result = await inflight.get(fp)
          if (!cancelled && result) apply(result)
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
        const copy = {
          title: String(data.title).slice(0, 52),
          summary: softSummary(data.summary || ''),
          itemSummaries: Array.isArray(data.itemSummaries)
            ? data.itemSummaries.map((s) => String(s || '').trim().slice(0, 110))
            : [],
          contentFp: fp,
          updatedAt: Date.now(),
        }
        await saveShared(ids, fp, copy)
        return copy
      })()

      inflight.set(fp, promise)
      try {
        const result = await promise
        if (!cancelled && result) apply(result)
      } catch {
        /* best-effort */
      } finally {
        inflight.delete(fp)
      }
    }

    ;(async () => {
      const shared = await fetchShared(ids)
      if (cancelled) return
      if (shared) apply(shared)
      if (await needGemini(shared)) await runGemini()
    })()

    // Live updates when the other person regenerates / first-writes
    const channel = supabase
      .channel(`run_copy:${CONVERSATION_ID}:${ids}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'run_copy_cache',
          filter: `conversation_id=eq.${CONVERSATION_ID}`,
        },
        (payload) => {
          const row = payload.new
          if (!row || row.share_ids_key !== ids) return
          const copy = rowFromDb(row)
          if (copy) apply(copy)
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
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
