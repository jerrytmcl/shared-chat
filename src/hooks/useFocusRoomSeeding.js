import { useState, useEffect, useRef } from 'react'

/**
 * Seed a focus room suggestion from the latest material pile.
 * For tryout: force a suggestion to appear so Jerry can test the gutter layout.
 */
export function useFocusRoomSeeding(messages, onSeed) {
  const [seeded, setSeeded] = useState(false)
  const hasSeededRef = useRef(false)

  useEffect(() => {
    // Only seed once per session
    if (hasSeededRef.current || seeded) return

    // Find latest material run (consecutive attachments from same author)
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

    // Require at least 2 materials
    if (recentMaterials.length < 2) return

    // Get share IDs and extract titles
    const shareIds = recentMaterials.map((m) => m.share_id).filter(Boolean)
    const titles = recentMaterials
      .map((m) => m.share?.title)
      .filter(Boolean)

    // Create a seeded suggestion
    const seededSuggestion = {
      suggest: true,
      title: titles.length > 0 ? `Focus on ${titles[0]}` : 'Recent Materials',
      reason: `${recentMaterials.length} materials from your latest pile`,
      shareIds,
      analysisIds: [],
      seeded: true,
    }

    hasSeededRef.current = true
    setSeeded(true)
    onSeed?.(seededSuggestion)
  }, [messages, seeded, onSeed])

  return { seeded }
}
