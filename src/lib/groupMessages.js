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

function isBareHandle(s) {
  return /^@[\w.]+$/.test(String(s || '').trim())
}

function isUselessDescription(d) {
  const t = String(d || '').trim()
  return (
    !t ||
    t === 'Original link saved.' ||
    t === 'Post on X' ||
    t === 'Link'
  )
}

/** Description looks like real tweet/article text (not placeholder / handle / url). */
export function looksLikeRealText(d) {
  const t = String(d || '').trim()
  if (isUselessDescription(t)) return false
  if (isBareHandle(t)) return false
  if (isAllDigits(t)) return false
  if (/^https?:\/\//i.test(t)) return false
  // Prefer text with spaces or decent length
  if (t.length >= 12) return true
  if (/\s/.test(t) && t.length >= 6) return true
  return false
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
        return `@${user}`
      }
      return 'Post on X'
    }

    const useful = segments.filter((s) => !isAllDigits(s) && !/^status$/i.test(s))
    if (useful.length >= 1) {
      const first = useful[0]
      if (first.startsWith('@')) return first
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

function titleIsWeak(title, href) {
  const t = (title || '').trim()
  if (!t) return true
  if (isAllDigits(t)) return true
  if (looksLikeRawUrlOrPath(t, href)) return true
  if (isBareHandle(t)) return true
  if (/^(x\.com|twitter\.com|substack\.com)$/i.test(t)) return true
  return false
}

/**
 * Content-first label for a share (collapsed run + flat rows).
 * Prefer real tweet/article text over bare @handles / urls / ids.
 */
export function shareDisplayLabel(share) {
  if (!share) return 'Item'
  const kind = share.kind || 'link'
  if (kind === 'image' || kind === 'gif' || kind === 'document') {
    const title = (share.title || '').trim()
    return truncateLabel(title || kindLabel(kind))
  }
  const title = (share.title || '').trim()
  const desc = (share.description || '').trim()
  const href = share.href || share.url || ''

  // Strong title: not handle / url / path / digits
  if (title && !titleIsWeak(title, href)) {
    return truncateLabel(title)
  }

  // Real description beats weak title (@handle, path, etc.)
  if (looksLikeRealText(desc)) {
    return truncateLabel(desc)
  }

  // Handle-only title is weak but better than host/path
  if (isBareHandle(title)) {
    return truncateLabel(title)
  }

  if (looksLikeRawUrlOrPath(title, href) || isAllDigits(title) || !title) {
    return truncateLabel(nicerLinkLabel(href || title))
  }
  return truncateLabel(title || nicerLinkLabel(href) || 'Link')
}

/**
 * Expanded-row primary line: short summary, not full tweet unless tiny.
 * Prefer real description/title (same weak-title rules as shareDisplayLabel).
 * ≤110 chars → as-is; else truncate at word boundary to ~100 + ….
 * Never bare @handle / raw url / status id when real text exists.
 * Images/gifs/docs keep filename/kind label.
 */
function truncateAtWord(s, max = 100) {
  const t = String(s || '').trim()
  if (!t) return ''
  if (t.length <= max) return t
  const slice = t.slice(0, max)
  const lastSpace = slice.lastIndexOf(' ')
  const cut = lastSpace > Math.floor(max * 0.55) ? slice.slice(0, lastSpace) : slice
  return `${cut.trimEnd()}…`
}

export function shareRowSummary(share) {
  if (!share) return 'Item'
  const kind = share.kind || 'link'
  if (kind === 'image' || kind === 'gif' || kind === 'document') {
    const title = (share.title || '').trim()
    return title || kindLabel(kind)
  }
  const title = (share.title || '').trim()
  const desc = (share.description || '').trim()
  const href = share.href || share.url || ''

  let text = ''
  // Strong title first (same weak-title rules as shareDisplayLabel)
  if (title && !titleIsWeak(title, href)) {
    text = title
  } else if (looksLikeRealText(desc)) {
    text = desc
  } else if (looksLikeRealText(title)) {
    text = title
  }

  if (text) {
    // Never surface bare handle / url / digits when we found real text
    if (isBareHandle(text) || isAllDigits(text) || /^https?:\/\//i.test(text)) {
      if (looksLikeRealText(desc) && desc !== text) {
        text = desc
      }
    }
    if (text.length <= 110) return text
    return truncateAtWord(text, 100)
  }

  // No real content — last-resort labels (handle / nicer url)
  if (isBareHandle(title)) return title
  if (looksLikeRawUrlOrPath(title, href) || isAllDigits(title) || !title) {
    return nicerLinkLabel(href || title)
  }
  return title || nicerLinkLabel(href) || 'Link'
}

/**
 * Small grey secondary line under the content title: "@handle · x.com" or host.
 */
export function shareSecondaryLine(share) {
  if (!share) return ''
  const href = share.href || share.url || ''
  const host = href ? hostnameFromUrl(href) : ''
  let byline =
    (share.byline || share.metadata?.byline || '').trim() || ''

  if (!byline && href && isXHost(host)) {
    const fromUrl = nicerLinkLabel(href)
    if (isBareHandle(fromUrl)) byline = fromUrl
  }

  // If title itself is a bare handle and we have no byline, use it
  if (!byline && isBareHandle(share.title)) {
    byline = share.title.trim()
  }

  if (byline && host) {
    // Avoid "@foo · @foo"
    if (byline.toLowerCase() === `@${host}` || byline.toLowerCase() === host) {
      return byline
    }
    return `${byline} · ${host}`
  }
  if (byline) return byline
  return host || ''
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

function isContentLabel(label) {
  const t = String(label || '').trim()
  if (!t || isWeakLabel(t)) return false
  if (isBareHandle(t)) return false
  return true
}

/**
 * Living collapsed title/summary for a material-run as items grow.
 * Prefer content (tweet/article text) over @handles and hostnames.
 */
export function runCardCopy(items) {
  const list = Array.isArray(items) ? items : []
  const n = list.length
  if (n === 0) return { title: 'Shared', summary: '' }

  if (n === 1) {
    const share = list[0].share
    const title = shareDisplayLabel(share)
    const secondary = shareSecondaryLine(share)
    const desc = (share?.description || '').trim()
    let summary = secondary
    // If title came from a short label and desc has more, hint at content
    if (
      looksLikeRealText(desc) &&
      truncateLabel(desc) !== title &&
      !isBareHandle(title)
    ) {
      // secondary line is enough under a content title
      summary = secondary || kindLabel(share?.kind || 'link')
    } else if (!summary) {
      summary = kindLabel(share?.kind || 'link')
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
  const content = labels.filter((l) => isContentLabel(l))

  let title
  let summary

  if (content.length >= 1) {
    // Real tweet/article text available — temporary content-ish title until Gemini
    const first = content[0]
    title = `${truncateLabel(first, 28)} and ${n - 1} more`
    const summaryParts = content.slice(0, 2)
    summary = summaryParts.join(' · ')
    if (n > 2 && summaryParts.length) summary += ` · +${n - 2} more`
    summary = truncateLabel(summary, 90)
  } else if (mixedKinds) {
    const parts = []
    if (hasLink) parts.push('links')
    if (hasMedia) parts.push(kinds.has('gif') && !kinds.has('image') ? 'gifs' : 'images')
    if (hasDoc) parts.push('files')
    title = `${n} things · ${parts.join(' & ')}`
    summary = 'Open for details'
  } else {
    // Only weak labels (@handles / hosts) — never "@A and N more" spam
    const kindNames = [...kinds].map((k) => kindLabel(k).toLowerCase() + 's')
    if (kindNames.length === 1 && kinds.has('link')) {
      title = `${n} links`
    } else if (kindNames.length === 1) {
      title = `${n} ${kindNames[0]}`
    } else {
      title = `${n} links`
    }
    summary = 'Open for details'
  }

  return { title: truncateLabel(title, 52), summary }
}
