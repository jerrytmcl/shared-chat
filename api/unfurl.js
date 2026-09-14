/**
 * POST /api/unfurl
 * Best-effort link metadata for share titles — content-first.
 * Auth: Bearer Supabase JWT (same pattern as suggest.js).
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const FETCH_TIMEOUT_MS = 4000
const UA =
  'Mozilla/5.0 (compatible; SharedChatUnfurl/1.0; +https://vercel.app) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  for (const [k, v] of Object.entries(cors)) res.setHeader(k, v)
  res.end(JSON.stringify(body))
}

function normalizeUrl(raw) {
  const s = (raw || '').trim()
  if (!s) return ''
  try {
    return new URL(s).origin
  } catch {
    return s.replace(/\/+$/, '').replace(/\/rest\/v1$/i, '').replace(/\/auth\/v1$/i, '')
  }
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function metaContent(html, prop) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
    'i'
  )
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
    'i'
  )
  const m = html.match(re) || html.match(re2)
  return m ? stripHtml(m[1]) : ''
}

function titleTag(html) {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  return m ? stripHtml(m[1]) : ''
}

function isXHost(host) {
  const h = (host || '').toLowerCase().replace(/^www\./, '')
  return h === 'x.com' || h === 'twitter.com' || h.endsWith('.twitter.com')
}

function handleFromXUrl(url) {
  try {
    const u = new URL(url)
    const segs = u.pathname.split('/').filter(Boolean)
    if (!segs.length) return ''
    const first = segs[0].replace(/^@/, '')
    if (/^(i|home|explore|search|intent|share)$/i.test(first)) return ''
    if (/^\d+$/.test(first)) return ''
    return first
  } catch {
    return ''
  }
}

/** Extract status id from x.com / twitter.com URLs. */
function statusIdFromXUrl(url) {
  try {
    const u = new URL(url)
    const segs = u.pathname.split('/').filter(Boolean)
    const statusIdx = segs.findIndex((s) => /^status$/i.test(s))
    if (statusIdx >= 0 && segs[statusIdx + 1] && /^\d+$/.test(segs[statusIdx + 1])) {
      return segs[statusIdx + 1]
    }
    // /i/status/{id}
    if (segs[0] === 'i' && /^status$/i.test(segs[1] || '') && /^\d+$/.test(segs[2] || '')) {
      return segs[2]
    }
  } catch {
    /* ignore */
  }
  return ''
}

function truncate(s, max) {
  const t = String(s || '').trim()
  if (!t) return ''
  if (t.length <= max) return t
  return `${t.slice(0, max - 1).trimEnd()}…`
}

function isBareHandle(s) {
  return /^@[\w.]+$/.test(String(s || '').trim())
}

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    // Always follow redirects (Twitter oEmbed returns 301 → publish.x.com)
    return await fetch(url, { ...opts, signal: ctrl.signal, redirect: 'follow' })
  } finally {
    clearTimeout(t)
  }
}

function xMetaFromTweetText(tweetText, handle, authorName) {
  const byline = handle ? `@${handle}` : authorName ? authorName : ''
  // Collapse whitespace/newlines so titles are single-line snippets
  const text = String(tweetText || '').replace(/\s+/g, ' ').trim()
  let title
  let description
  if (text) {
    title = truncate(text, 90)
    description = truncate(text, 200)
  } else {
    title = byline || (authorName ? `Post by ${authorName}` : 'Post on X')
    description = ''
  }
  // Never return bare @handle as title when tweet text exists
  if (isBareHandle(title) && text) {
    title = truncate(text, 90)
  }
  return {
    title,
    description,
    byline: byline || undefined,
    platform: 'X',
    site: 'x.com',
  }
}

async function unfurlXViaOembed(url) {
  const oembed = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`
  const resp = await fetchWithTimeout(oembed, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  })
  if (!resp.ok) throw new Error(`oEmbed ${resp.status}`)
  const data = await resp.json()
  const authorName = (data.author_name || '').trim()
  const authorUrl = data.author_url || ''
  let handle = handleFromXUrl(authorUrl) || handleFromXUrl(url)
  if (handle) handle = handle.replace(/^@/, '')

  const tweetText = stripHtml(data.html || '')
  if (!tweetText) throw new Error('oEmbed empty html')
  return xMetaFromTweetText(tweetText, handle, authorName)
}

async function unfurlXViaFxTwitter(url) {
  const statusId = statusIdFromXUrl(url)
  if (!statusId) throw new Error('no status id for FxTwitter')

  const handleHint = handleFromXUrl(url)
  const candidates = []
  if (handleHint) {
    candidates.push(`https://api.fxtwitter.com/${encodeURIComponent(handleHint)}/status/${statusId}`)
  }
  candidates.push(`https://api.fxtwitter.com/status/${statusId}`)

  let lastErr
  for (const fxUrl of candidates) {
    try {
      const resp = await fetchWithTimeout(fxUrl, {
        headers: { Accept: 'application/json', 'User-Agent': UA },
      })
      if (!resp.ok) {
        lastErr = new Error(`FxTwitter ${resp.status}`)
        continue
      }
      const data = await resp.json()
      const tweet = data.tweet || data
      const tweetText = String(tweet.text || tweet.raw_text?.text || '').trim()
      if (!tweetText) {
        lastErr = new Error('FxTwitter empty text')
        continue
      }
      const screen =
        tweet.author?.screen_name ||
        tweet.author?.username ||
        handleHint ||
        ''
      const handle = String(screen).replace(/^@/, '')
      const authorName = tweet.author?.name || ''
      return xMetaFromTweetText(tweetText, handle, authorName)
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr || new Error('FxTwitter failed')
}

async function unfurlX(url) {
  // 1) Twitter/X oEmbed with redirect follow
  try {
    const result = await unfurlXViaOembed(url)
    console.log('unfurlX path=oembed', { url: url.slice(0, 80), title: (result.title || '').slice(0, 40) })
    return { ...result, _path: 'oembed' }
  } catch (e) {
    console.warn('unfurlX oembed failed', e.message || e)
  }

  // 2) FxTwitter fallback
  try {
    const result = await unfurlXViaFxTwitter(url)
    console.log('unfurlX path=fxtwitter', { url: url.slice(0, 80), title: (result.title || '').slice(0, 40) })
    return { ...result, _path: 'fxtwitter' }
  } catch (e) {
    console.warn('unfurlX fxtwitter failed', e.message || e)
  }

  // Last resort — bare handle (no tweet text available)
  const handle = handleFromXUrl(url)
  console.log('unfurlX path=fallback-handle', { url: url.slice(0, 80) })
  return {
    title: handle ? `@${handle}` : 'Post on X',
    description: '',
    byline: handle ? `@${handle}` : undefined,
    platform: 'X',
    site: 'x.com',
    _path: 'fallback-handle',
  }
}


function isInstagramUrl(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
    return h === 'instagram.com' || h.endsWith('.instagram.com')
  } catch {
    return false
  }
}

async function unfurlInstagram(url) {
  // ddinstagram mirrors public OG like FxTwitter does for X
  try {
    const u = new URL(url)
    const dd = `https://www.ddinstagram.com${u.pathname}${u.search || ''}`
    const result = await unfurlOg(dd)
    const title = (result.title || '').trim()
    const desc = (result.description || '').trim()
    if (
      (title && title.toLowerCase() !== 'instagram') ||
      (desc && desc.length >= 8)
    ) {
      let byline = (result.byline || '').trim()
      // Prefer @user from path /p/… or /reel/… won't have it; /username/…
      const parts = u.pathname.split('/').filter(Boolean)
      if (!byline && parts[0] && !['p', 'reel', 'tv', 'stories'].includes(parts[0].toLowerCase())) {
        byline = `@${parts[0]}`
      }
      console.log('unfurlIG path=ddinstagram', { url: url.slice(0, 80) })
      return {
        title: title && title.toLowerCase() !== 'instagram' ? title.slice(0, 120) : truncate(desc, 90),
        description: desc.slice(0, 240) || undefined,
        byline: byline || undefined,
        platform: 'Instagram',
        site: 'instagram.com',
        _path: 'ddinstagram',
      }
    }
  } catch (e) {
    console.warn('unfurlIG ddinstagram failed', e.message || e)
  }

  try {
    const oembed = `https://api.instagram.com/oembed/?url=${encodeURIComponent(url)}`
    const resp = await fetchWithTimeout(oembed, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
    })
    if (resp.ok) {
      const data = await resp.json()
      const title = String(data.title || data.author_name || '').trim()
      const byline = data.author_name ? `@${String(data.author_name).replace(/^@/, '')}` : undefined
      if (title) {
        console.log('unfurlIG path=oembed', { url: url.slice(0, 80) })
        return {
          title: title.slice(0, 120),
          description: undefined,
          byline,
          platform: 'Instagram',
          site: 'instagram.com',
          _path: 'oembed',
        }
      }
    }
  } catch (e) {
    console.warn('unfurlIG oembed failed', e.message || e)
  }

  console.log('unfurlIG path=fallback', { url: url.slice(0, 80) })
  return {
    title: 'Instagram post',
    description: 'Preview unavailable — open to view.',
    byline: undefined,
    platform: 'Instagram',
    site: 'instagram.com',
    _path: 'fallback',
  }
}

async function unfurlOg(url) {
  const resp = await fetchWithTimeout(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': UA,
    },
  })
  if (!resp.ok) throw new Error(`fetch ${resp.status}`)
  const html = (await resp.text()).slice(0, 200_000)
  const title =
    metaContent(html, 'og:title') ||
    metaContent(html, 'twitter:title') ||
    titleTag(html) ||
    ''
  const description =
    metaContent(html, 'og:description') ||
    metaContent(html, 'twitter:description') ||
    metaContent(html, 'description') ||
    ''
  const siteName = metaContent(html, 'og:site_name') || ''
  const author =
    metaContent(html, 'author') ||
    metaContent(html, 'article:author') ||
    ''

  let platform
  let host = ''
  try {
    host = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
    if (host === 'substack.com' || host.endsWith('.substack.com')) platform = 'Substack'
    else platform = host
  } catch {
    platform = undefined
  }

  const byline = author || siteName || (platform && platform !== host ? platform : '') || undefined

  let finalTitle = title.slice(0, 120) || undefined
  // Never return bare @handle as title when OG text exists
  if (finalTitle && isBareHandle(finalTitle) && description) {
    finalTitle = truncate(description, 90)
  }

  return {
    title: finalTitle,
    description: description.slice(0, 240) || undefined,
    byline,
    platform,
    site: host || undefined,
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    for (const [k, v] of Object.entries(cors)) res.setHeader(k, v)
    res.statusCode = 204
    return res.end()
  }
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' })
  }

  const supabaseUrl = normalizeUrl(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  )
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  const anonKey = (
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim()
  // Prefer anon key for JWT validation — matches the client; avoids 401 when
  // SERVICE_ROLE_KEY is missing/wrong for this project.
  const authKey = anonKey || serviceKey
  if (!supabaseUrl || !authKey) {
    return json(res, 500, {
      error: 'Server missing SUPABASE_URL or SUPABASE_ANON_KEY / SERVICE_ROLE_KEY',
    })
  }

  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return json(res, 401, { error: 'Missing Authorization bearer token' })

  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      return json(res, 400, { error: 'Invalid JSON body' })
    }
  }
  body = body || {}
  const url = typeof body.url === 'string' ? body.url.trim() : ''
  if (!url) return json(res, 400, { error: 'url required' })

  let parsed
  try {
    parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return json(res, 400, { error: 'Only http(s) urls supported' })
    }
  } catch {
    return json(res, 400, { error: 'Invalid url' })
  }

  const authClient = createClient(supabaseUrl, authKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userErr } = await authClient.auth.getUser(token)
  if (userErr || !userData?.user) {
    console.warn('unfurl auth failed', userErr?.message || userErr)
    return json(res, 401, { error: 'Invalid or expired token' })
  }

  try {
    let result
    if (isXHost(parsed.hostname)) {
      result = await unfurlX(url)
    } else if (isInstagramUrl(url)) {
      result = await unfurlInstagram(url)
    } else {
      result = await unfurlOg(url)
    }

    if (!result.title) {
      const handle = handleFromXUrl(url)
      result.title = handle ? `@${handle}` : parsed.hostname.replace(/^www\./, '')
    }

    // Never promote bare @handle when we somehow have description text
    if (isBareHandle(result.title) && result.description && !isBareHandle(result.description)) {
      result.title = truncate(result.description, 90)
    }

    return json(res, 200, {
      title: String(result.title).slice(0, 120),
      description: String(result.description || '').slice(0, 240),
      byline: result.byline ? String(result.byline).slice(0, 80) : undefined,
      platform: result.platform || undefined,
      site: result.site || undefined,
    })
  } catch (e) {
    console.error('unfurl failed', e)
    return json(res, 502, { error: String(e.message || e).slice(0, 200) })
  }
}

/** Exported for local verification scripts (not used by Vercel handler). */
export { unfurlX, unfurlXViaFxTwitter, unfurlXViaOembed, statusIdFromXUrl, fetchWithTimeout }
