/**
 * Consecutive attachment-only messages from one author collapse into a
 * material-run group. A text (or chip/package) message ends the run.
 * Human runs are UI grouping only — not a DB entity.
 */
export function groupMessages(messages) {
  return messages.reduce((groups, m) => {
    const last = groups.at(-1)
    const isAttachmentOnly =
      m.kind === 'attachment' &&
      !(m.body && m.body.trim()) &&
      m.share &&
      !m.source_ids?.length

    if (isAttachmentOnly) {
      if (last?.items && last.author_id === m.author_id) {
        last.items.push(m)
      } else {
        groups.push({
          id: m.id,
          author_id: m.author_id,
          author_name: m.author_name,
          created_at: m.created_at,
          items: [m],
        })
      }
    } else {
      groups.push(m)
    }
    return groups
  }, [])
}

export function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export function platformFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (host === 'x.com' || host === 'twitter.com') return 'X'
    return 'Link'
  } catch {
    return 'Link'
  }
}

export function detectKindFromFile(file) {
  const type = file.type || ''
  if (type === 'image/gif' || /\.gif$/i.test(file.name)) return 'gif'
  if (type.startsWith('image/')) return 'image'
  return 'document'
}

export function kindLabel(kind) {
  const map = { link: 'Link', image: 'Image', document: 'Document', gif: 'GIF' }
  return map[kind] || kind
}
