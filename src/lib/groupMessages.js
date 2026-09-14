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
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export function hostnameFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

/** Soft label for storage / search — not used for icons. */
export function platformFromUrl(url) {
  try {
    const host = hostnameFromUrl(url)
    if (!host) return 'Link'
    if (host === 'x.com' || host === 'twitter.com' || host.endsWith('.twitter.com'))
      return 'X'
    if (host === 'substack.com' || host.endsWith('.substack.com'))
      return 'Substack'
    return host
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

/**
 * Unique source marks for a material-run stack (max 3).
 * Links use the site favicon from the hostname — no per-brand icons.
 */
export function sourceMarksForItems(items) {
  const out = []
  const seen = new Set()
  for (const m of items) {
    const share = m.share
    if (!share) continue
    let key
    let mark
    if (share.kind === 'image' || share.kind === 'gif') {
      key = share.kind
      mark = { type: 'icon', name: 'camera', label: kindLabel(share.kind) }
    } else if (share.href) {
      const host = hostnameFromUrl(share.href)
      key = host || share.href
      mark = host
        ? { type: 'favicon', label: host, host }
        : { type: 'icon', name: 'file', label: 'Link' }
    } else {
      key = share.kind || 'document'
      mark = {
        type: 'icon',
        name: 'file',
        label: kindLabel(share.kind) || 'File',
      }
    }
    if (seen.has(key)) continue
    seen.add(key)
    out.push(mark)
    if (out.length >= 3) break
  }
  return out
}
