import { useEffect, useRef } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

const PLACEHOLDER_DESC = 'Original link saved.'
const CONCURRENCY = 2

function isAllDigits(s) {
  return /^\d{6,}$/.test(String(s || '').trim())
}

function isBareHandle(s) {
  return /^@[\w.]+$/.test(String(s || '').trim())
}

function titleLooksRaw(title, href) {
  const t = String(title || '').trim()
  if (!t) return true
  if (isAllDigits(t)) return true
  if (t.includes('/')) return true
  try {
    if (href) {
      const u = new URL(href)
      const hostPath = u.hostname.replace(/^www\./, '') + u.pathname
      if (t === hostPath || t === u.hostname + u.pathname) return true
    }
  } catch {
    /* ignore */
  }
  return false
}

/**
 * Whether a link share still needs /api/unfurl backfill.
 */
export function needsEnrich(share) {
  if (!share) return false
  if (share.kind && share.kind !== 'link') return false
  const href = share.href || share.url
  if (!href) return false
  if (!share.id) return false

  const title = (share.title || '').trim()
  const desc = (share.description || '').trim()

  if (!desc || desc === PLACEHOLDER_DESC) return true
  if (titleLooksRaw(title, href)) return true
  // Bare @handle title with empty/useless description
  if (
    isBareHandle(title) &&
    (!desc ||
      desc === PLACEHOLDER_DESC ||
      desc === 'Post on X' ||
      desc.length < 8)
  ) {
    return true
  }
  return false
}

/**
 * After messages load, unfurl weak link shares (concurrency 2),
 * patch local state + original_shares so content sticks.
 * Tracks attempted ids so we don't loop forever.
 */
export function useEnrichShares(messages, setMessages) {
  const attemptedRef = useRef(new Set())
  const runningRef = useRef(false)

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !setMessages) return undefined
    if (!Array.isArray(messages) || !messages.length) return undefined

    const weak = []
    for (const m of messages) {
      const share = m.share
      if (!share?.id) continue
      if (attemptedRef.current.has(share.id)) continue
      if (needsEnrich(share)) {
        weak.push({ share })
      }
    }
    if (!weak.length) return undefined
    if (runningRef.current) return undefined

    let cancelled = false
    runningRef.current = true

    ;(async () => {
      let cursor = 0

      async function worker() {
        while (!cancelled) {
          const idx = cursor++
          if (idx >= weak.length) return
          const { share } = weak[idx]
          attemptedRef.current.add(share.id)
          const href = share.href || share.url
          try {
            const { data: sessionData } = await supabase.auth.getSession()
            const token = sessionData?.session?.access_token
            if (!token) continue

            const resp = await fetch('/api/unfurl', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ url: href }),
            })
            if (!resp.ok) continue
            const meta = await resp.json()
            if (!meta?.title && !meta?.description) continue

            const title = meta.title
              ? String(meta.title).slice(0, 120)
              : share.title
            const description =
              meta.description != null && meta.description !== ''
                ? String(meta.description).slice(0, 240)
                : share.description
            const platform = meta.platform || share.platform
            const byline = meta.byline || share.byline || share.metadata?.byline

            if (cancelled) return

            setMessages((prev) =>
              prev.map((m) => {
                if (m.share?.id !== share.id) return m
                return {
                  ...m,
                  share: {
                    ...m.share,
                    title,
                    description,
                    platform,
                    byline,
                    metadata: {
                      ...(m.share.metadata || {}),
                      ...(byline ? { byline } : {}),
                    },
                  },
                }
              })
            )

            await supabase
              .from('original_shares')
              .update({ title, description })
              .eq('id', share.id)
          } catch (e) {
            console.warn('enrich share failed', share.id, e)
          }
        }
      }

      const n = Math.min(CONCURRENCY, weak.length)
      await Promise.all(Array.from({ length: n }, () => worker()))
      runningRef.current = false
    })()

    return () => {
      cancelled = true
      runningRef.current = false
    }
  }, [messages, setMessages])
}
