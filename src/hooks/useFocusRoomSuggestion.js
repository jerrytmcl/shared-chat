import { useState, useEffect, useRef } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

const SETTLE_DELAY_MS = 3000 // Wait 3s after last material before suggesting
const MIN_MATERIALS = 2

/**
 * Detect material run piles and suggest focus rooms.
 * Returns { suggestion, busy, accept(), dismiss() }
 */
export function useFocusRoomSuggestion(messages, conversationId, user) {
  const [suggestion, setSuggestion] = useState(null)
  const [busy, setBusy] = useState(false)
  const settleTimer = useRef(null)
  const lastCheckRef = useRef(null)

  useEffect(() => {
    if (!isSupabaseConfigured || !user || !conversationId) return

    // Find recent material run (consecutive attachments from same author)
    const recentMaterials = []
    let runAuthor = null

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.kind === 'text' && msg.body?.trim()) break // Text ends the run

      if (msg.kind === 'attachment' && msg.share_id) {
        if (!runAuthor) runAuthor = msg.author_id
        if (msg.author_id === runAuthor) {
          recentMaterials.unshift(msg)
        } else {
          break
        }
      }
    }

    if (recentMaterials.length < MIN_MATERIALS) {
      clearTimeout(settleTimer.current)
      return
    }

    const shareIds = recentMaterials.map((m) => m.share_id).filter(Boolean)
    const fingerprint = shareIds.sort().join(',')

    // Don't re-check the same pile
    if (fingerprint === lastCheckRef.current) return

    // Debounce: wait for pile to settle
    clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => {
      checkFocusSuggestion(conversationId, shareIds, messages.slice(-12))
    }, SETTLE_DELAY_MS)

    return () => clearTimeout(settleTimer.current)
  }, [messages, conversationId, user])

  async function checkFocusSuggestion(convId, shareIds, recentMsgs) {
    if (!supabase || !user) return

    const fingerprint = shareIds.sort().join(',')
    if (fingerprint === lastCheckRef.current) return

    lastCheckRef.current = fingerprint
    setBusy(true)

    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      if (!token) return

      // Call analyze first
      await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversationId: convId,
          shareIds,
          recentMessages: recentMsgs.map((m) => ({
            id: m.id,
            kind: m.kind,
            body: m.body,
          })),
        }),
      })

      // Then call suggest-focus
      const resp = await fetch('/api/suggest-focus', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversationId: convId,
          shareIds,
        }),
      })

      if (!resp.ok) {
        console.warn('suggest-focus failed', resp.status)
        return
      }

      const result = await resp.json()

      if (result.suggest) {
        setSuggestion(result)
      }
    } catch (e) {
      console.error('focus suggestion failed', e)
    } finally {
      setBusy(false)
    }
  }

  async function accept() {
    if (!suggestion || busy || !supabase || !user) return

    setBusy(true)

    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      if (!token) return null

      const resp = await fetch('/api/focus/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversationId,
          title: suggestion.title,
          shareIds: suggestion.shareIds,
          analysisIds: suggestion.analysisIds,
        }),
      })

      if (!resp.ok) {
        console.error('focus room create failed', resp.status)
        return null
      }

      const result = await resp.json()
      setSuggestion(null)
      return result.roomId
    } catch (e) {
      console.error('focus room create error', e)
      return null
    } finally {
      setBusy(false)
    }
  }

  function dismiss() {
    setSuggestion(null)
    lastCheckRef.current = null
  }

  return { suggestion, busy, accept, dismiss }
}
