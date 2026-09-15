import { useState, useEffect } from 'react'

/**
 * Manage dismissed focus suggestions with localStorage persistence.
 * Returns { dismissed, dismiss, restore, isDismissed }
 */
export function useDismissedSuggestions(conversationId) {
  const [dismissed, setDismissed] = useState([])
  const storageKey = `focus-dismissed-${conversationId}`

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        const parsed = JSON.parse(stored)
        setDismissed(parsed)
      }
    } catch (e) {
      console.error('Failed to load dismissed suggestions', e)
    }
  }, [storageKey])

  function dismiss(suggestion) {
    const fingerprint = (suggestion.shareIds || []).sort().join(',')
    const entry = {
      fingerprint,
      title: suggestion.title,
      reason: suggestion.reason,
      shareIds: suggestion.shareIds,
      analysisIds: suggestion.analysisIds,
      dismissedAt: new Date().toISOString(),
    }

    const updated = [...dismissed.filter((d) => d.fingerprint !== fingerprint), entry]
    setDismissed(updated)

    try {
      localStorage.setItem(storageKey, JSON.stringify(updated))
    } catch (e) {
      console.error('Failed to persist dismissed suggestion', e)
    }

    return entry
  }

  function restore(fingerprint) {
    const entry = dismissed.find((d) => d.fingerprint === fingerprint)
    const updated = dismissed.filter((d) => d.fingerprint !== fingerprint)
    setDismissed(updated)

    try {
      localStorage.setItem(storageKey, JSON.stringify(updated))
    } catch (e) {
      console.error('Failed to persist dismissed suggestion removal', e)
    }

    return entry
  }

  function isDismissed(shareIds) {
    const fingerprint = (shareIds || []).sort().join(',')
    return dismissed.some((d) => d.fingerprint === fingerprint)
  }

  return { dismissed, dismiss, restore, isDismissed }
}
