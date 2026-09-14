/**
 * POST /api/run-copy
 * Gemini title/summary for collapsed material-run cards.
 * Auth: Bearer Supabase JWT (same pattern as suggest.js).
 *
 * Body: { items: [{ title, description, kind, href, platform, byline }] }
 * Returns: { title, summary }
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY (optional)
 */

import { createClient } from '@supabase/supabase-js'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const GEMINI_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash']

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

function extractJsonObject(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

function isAllDigits(s) {
  return /^\d{6,}$/.test(String(s || '').trim())
}

function looksLikeHost(s) {
  const t = String(s || '').trim().toLowerCase()
  return (
    /^(x\.com|twitter\.com|substack\.com)/.test(t) ||
    /\.(com|org|net|io|co|app)$/.test(t)
  )
}

function isBareHandle(s) {
  return /^@[\w.]+$/.test(String(s || '').trim())
}

function heuristicCopy(items) {
  const labels = (items || [])
    .map((it) => {
      const desc = String(it.description || '').trim()
      const title = String(it.title || '').trim()
      // Prefer description (tweet/article text) over bare handles
      if (desc && desc !== 'Original link saved.' && desc.length >= 8 && !isBareHandle(desc)) {
        return desc
      }
      // Skip bare @handles — better temporary "N links" than handle spam
      if (isBareHandle(title)) return ''
      if (title && !isAllDigits(title) && !looksLikeHost(title)) return title
      return ''
    })
    .filter((t) => t && !isAllDigits(t) && !looksLikeHost(t) && !isBareHandle(t))
  const n = (items || []).length
  if (!n) return { title: 'Shared', summary: '' }
  if (labels.length === 0) {
    return {
      title: n === 1 ? 'Shared item' : `${n} links`,
      summary: n >= 2 ? 'Open for details' : '',
    }
  }
  const first = labels[0]
  const title =
    n === 1
      ? first.slice(0, 48)
      : labels.length === 1
        ? `${first.slice(0, 36)} and ${n - 1} more`
        : `${first.slice(0, 28)} and ${n - 1} more`
  const summary = labels.slice(0, 2).join(' · ').slice(0, 90)
  return { title: title.slice(0, 52), summary }
}

async function callGemini(model, apiKey, system, user) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json',
      },
    }),
  })
  const bodyText = await resp.text()
  if (!resp.ok) {
    const err = new Error(`Gemini ${model} ${resp.status}: ${bodyText.slice(0, 240)}`)
    err.status = resp.status
    throw err
  }
  let data
  try {
    data = JSON.parse(bodyText)
  } catch {
    throw new Error(`Gemini ${model} bad JSON envelope`)
  }
  return data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || ''
}

async function geminiCopy(items, apiKey) {
  const catalog = items.map((it, i) => ({
    i,
    kind: it.kind || 'link',
    title: String(it.title || '').slice(0, 120),
    // Emphasize description / tweet text — primary signal for theming
    description: String(it.description || '').slice(0, 200),
    byline: it.byline || null,
    platform: it.platform || null,
  }))

  const system = `You write short card titles for a private 2-person chat dump of shared links/files.
Given shared items, return JSON only: {"title":string,"summary":string}
Rules:
- Use descriptions and tweet/article text as the primary signal for what was shared
- title: thematic (~6 words max) — WHAT the content is about (topics/themes), not who posted
- summary: one line (~14 words) summarizing WHAT was shared across the items
- FORBIDDEN: listing @handles only; listing domains/hostnames (x.com, substack.com, etc.)
- Favicons already show sources — never put hostnames in title or summary
- Prefer themes like "AI design threads" over "@Stefan and 2 more"
- Never invent facts not hinted by the titles/descriptions`

  const user = JSON.stringify({ items: catalog })

  let rawText = ''
  let lastErr = null
  for (const model of GEMINI_MODELS) {
    try {
      rawText = await callGemini(model, apiKey, system, user)
      break
    } catch (e) {
      lastErr = e
      const msg = String(e.message || e)
      if (/404|not found|NOT_FOUND|unavailable|403/i.test(msg) && model !== GEMINI_MODELS.at(-1)) {
        continue
      }
      throw e
    }
  }
  if (!rawText) throw lastErr || new Error('Gemini unavailable')

  const parsed = extractJsonObject(rawText)
  if (!parsed?.title) throw new Error('bad_model_json')
  return {
    title: String(parsed.title).slice(0, 52),
    summary: String(parsed.summary || '').slice(0, 90),
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
  const authKey = anonKey || serviceKey
  const geminiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    ''
  ).trim()

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
  const items = Array.isArray(body.items) ? body.items : []
  if (!items.length) return json(res, 400, { error: 'items required' })

  const authClient = createClient(supabaseUrl, authKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userErr } = await authClient.auth.getUser(token)
  if (userErr || !userData?.user) {
    console.warn('run-copy auth failed', userErr?.message || userErr)
    return json(res, 401, { error: 'Invalid or expired token' })
  }

  const fallback = heuristicCopy(items)
  if (!geminiKey || items.length < 2) {
    return json(res, 200, { ...fallback, method: 'heuristic' })
  }

  try {
    const result = await geminiCopy(items, geminiKey)
    return json(res, 200, { ...result, method: 'gemini' })
  } catch (e) {
    console.error('run-copy gemini failed', e)
    return json(res, 200, {
      ...fallback,
      method: 'heuristic',
      geminiError: String(e.message || e).slice(0, 200),
    })
  }
}
