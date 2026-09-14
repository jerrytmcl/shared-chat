/**
 * POST /api/unfurl
 * Best-effort link metadata for share titles.
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

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

async function unfurlX(url) {
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

  const tweetText = stripHtml(data.html || '').slice(0, 140)
  let title
  if (handle) title = `@${handle}`
  else if (authorName) title = authorName
  else title = 'Post on X'

  if (handle && authorName && authorName.toLowerCase() !== handle.toLowerCase()) {
    title = `@${handle}`
  }
  // Prefer "Post by @handle" when we only have a vague author
  if (!handle && authorName) title = `Post by ${authorName}`
  else if (handle) title = `@${handle}`

  return {
    title,
    description: tweetText || 'Post on X',
    platform: 'X',
  }
}

async function unfurlOg(url) {
  const resp = await fetchWithTimeout(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': UA,
    },
    redirect: 'follow',
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
  let platform
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
    if (host === 'substack.com' || host.endsWith('.substack.com')) platform = 'Substack'
    else platform = host
  } catch {
    platform = undefined
  }
  return {
    title: title.slice(0, 120) || undefined,
    description: description.slice(0, 240) || undefined,
    platform,
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
  if (!supabaseUrl || !serviceKey) {
    return json(res, 500, {
      error: 'Server missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
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

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !userData?.user) {
    return json(res, 401, { error: 'Invalid or expired token' })
  }

  try {
    let result
    if (isXHost(parsed.hostname)) {
      try {
        result = await unfurlX(url)
      } catch (e) {
        console.warn('x oembed failed', e.message || e)
        const handle = handleFromXUrl(url)
        result = {
          title: handle ? `@${handle}` : 'Post on X',
          description: '',
          platform: 'X',
        }
      }
    } else {
      result = await unfurlOg(url)
    }

    if (!result.title) {
      const handle = handleFromXUrl(url)
      result.title = handle ? `@${handle}` : parsed.hostname.replace(/^www\./, '')
    }

    return json(res, 200, {
      title: String(result.title).slice(0, 120),
      description: String(result.description || '').slice(0, 240),
      platform: result.platform || undefined,
    })
  } catch (e) {
    console.error('unfurl failed', e)
    return json(res, 502, { error: String(e.message || e).slice(0, 200) })
  }
}
