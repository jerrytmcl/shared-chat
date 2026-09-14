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

function truncateLabel(s, max = 52) {
  const t = String(s || '').trim()
  if (!t) return ''
  if (t.length <= max) return t
  return `${t.slice(0, max - 1).trimEnd()}…`
}

function isAllDigits(s) {
  return /^\d{6,}$/.test(String(s || '').trim())
}

function isXHost(host) {
  const h = (host || '').toLowerCase()
  return h === 'x.com' || h === 'twitter.com' || h.endsWith('.twitter.com')
}

function looksLikeRawUrlOrPath(title, href) {
  if (!title) return true
  const t = title.trim()
  if (isAllDigits(t)) return true
  if (t.includes('/')) return true
  try {
    if (href) {
      const u = new URL(href)
      const hostPath = u.hostname.replace(/^www\./, '') + u.pathname
      if (t === hostPath || t === u.hostname + u.pathname) return true
      // title is just a status id that appears in the path
      if (isAllDigits(t) && u.pathname.includes(t)) return true
    }
  } catch {
    /* ignore */
  }
  return false
}

/**
 * Human-friendly label from a URL — never use numeric status IDs.
 * For x.com/twitter.com /User/status/123 → @User or "Post by @User".
 */
export function nicerLinkLabel(href) {
  try {
    const u = new URL(href)
    const host = u.hostname.replace(/^www\./, '')
    const segments = u.pathname.split('/').filter(Boolean)

    if (isXHost(host) && segments.length >= 1) {
      const user = segments[0].replace(/^@/, '')
      if (
        user &&
        !isAllDigits(user) &&
        !/^(i|home|explore|search|intent|share|status)$/i.test(user)
      ) {
        const statusIdx = segments.findIndex((s) => s.toLowerCase() === 'status')
        if (statusIdx >= 0) {
          return `@${user}`
        }
        if (segments.length === 1 || segments[1]?.toLowerCase() === 'status') {
          return `@${user}`
        }
        return `@${user}`
      }
      return 'Post on X'
    }

    // Prefer non-digit path segments (skip status ids, numeric slugs)
    const useful = segments.filter((s) => !isAllDigits(s) && !/^status$/i.test(s))
    if (useful.length >= 1) {
      const first = useful[0]
      if (first.startsWith('@')) return first
      // Substack @handle style: /@handle/...
      if (segments[0]?.startsWith('@')) {
        return segments[0]
      }
      if (useful.length === 1 && /^[A-Za-z0-9_.]+$/.test(first)) {
        return first.startsWith('@') ? first : `@${first}`
      }
      const last = useful[useful.length - 1]
      const cleaned = decodeURIComponent(last)
        .replace(/[-_]+/g, ' ')
        .replace(/\.\w+$/, '')
        .trim()
      if (cleaned && cleaned.length > 1 && !isAllDigits(cleaned)) return cleaned
    }
    return host
  } catch {
    return href || 'Link'
  }
}

/**
 * Human label for a share (collapsed run + flat rows).
 * Treats all-digit titles as raw and re-derives from href.
 */
export function shareDisplayLabel(share) {
  if (!share) return 'Item'
  const kind = share.kind || 'link'
  if (kind === 'image' || kind === 'gif' || kind === 'document') {
    const title = (share.title || '').trim()
    return truncateLabel(title || kindLabel(kind))
  }
  // link
  const title = (share.title || '').trim()
  const href = share.href || share.url || ''
  if (looksLikeRawUrlOrPath(title, href) || isAllDigits(title)) {
    return truncateLabel(nicerLinkLabel(href || title))
  }
  return truncateLabel(title || nicerLinkLabel(href) || 'Link')
}

function kindsPresent(items) {
  const set = new Set()
  for (const m of items) {
    if (m.share?.kind) set.add(m.share.kind)
  }
  return set
}

function isWeakLabel(label) {
  const t = String(label || '').trim()
  if (!t) return true
  if (isAllDigits(t)) return true
  if (/^(x\.com|twitter\.com|substack\.com)(\s*\+\s*)?/i.test(t)) return true
  if (/\.(com|org|net|io)\b/i.test(t) && !t.includes(' ')) return true
  return false
}

/**
 * Living collapsed title/summary for a material-run as items grow.
 * Prefer human labels over hostnames (favicons already show sites).
 */
export function runCardCopy(items) {
  const list = Array.isArray(items) ? items : []
  const n = list.length
  if (n === 0) return { title: 'Shared', summary: '' }

  if (n === 1) {
    const share = list[0].share
    const title = shareDisplayLabel(share)
    const host = share?.href ? hostnameFromUrl(share.href) : ''
    const kind = kindLabel(share?.kind || 'link')
    let summary = host || kind
    if (share?.kind === 'link' && host) {
      summary = `${host} · open`
    } else if (share?.kind === 'image' || share?.kind === 'gif') {
      summary = `${kind} · view`
    } else if (share?.kind === 'document') {
      summary = `${kind} · open`
    }
    return { title, summary: truncateLabel(summary, 90) }
  }

  const kinds = kindsPresent(list)
  const hasLink = kinds.has('link')
  const hasMedia = kinds.has('image') || kinds.has('gif')
  const hasDoc = kinds.has('document')
  const mixedKinds =
    [hasLink, hasMedia, hasDoc].filter(Boolean).length >= 2

  const labels = list.map((m) => shareDisplayLabel(m.share))
  const human = labels.filter((l) => !isWeakLabel(l) && !isAllDigits(l))

  let title
  if (human.length >= 1) {
    const first = human[0]
    title =
      n === 1
        ? first
        : `${truncateLabel(first, 28)} and ${n - 1} more`
  } else if (mixedKinds) {
    const parts = []
    if (hasLink) parts.push('links')
    if (hasMedia) parts.push(kinds.has('gif') && !kinds.has('image') ? 'gifs' : 'images')
    if (hasDoc) parts.push('files')
    title = `${n} things · ${parts.join(' & ')}`
  } else {
    const kindNames = [...kinds].map((k) => kindLabel(k).toLowerCase() + 's')
    title =
      kindNames.length === 1 ? `${n} ${kindNames[0]}` : `${n} shared items`
  }

  const summaryParts = (human.length ? human : labels.filter((l) => !isAllDigits(l))).slice(
    0,
    2
  )
  let summary = summaryParts.join(' · ')
  if (n > 2 && summaryParts.length) summary += ` · +${n - 2} more`
  summary = truncateLabel(summary, 90)

  return { title: truncateLabel(title, 52), summary }
}
