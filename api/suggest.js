/**
 * POST /api/suggest
 * Quiet suggestion-chip bot — high bar; returns chip proposal or suggest:false.
 * Auth: Bearer Supabase JWT. Server uses service role for share listing after verify.
 *
 * Env (Vercel, NOT VITE_*):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GEMINI_API_KEY (or GOOGLE_GENERATIVE_AI_API_KEY) — optional; keyword fallback if missing
 */

import { createClient } from '@supabase/supabase-js'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const GEMINI_MODELS = (process.env.GEMINI_MODELS || 'gemini-3.5-flash-lite,gemini-3.6-flash')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

let activeTrace = null
function slog(...args) {
  console.log('[shared-chat suggest]', ...args)
  if (activeTrace) {
    const [msg, data] = args
    activeTrace.push({
      at: new Date().toISOString(),
      message: String(msg),
      data: data === undefined ? null : data,
    })
  }
}

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

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
}

function keywordSuggest(recentMessages, shares) {
  slog('keyword path: scoring shares against recent message text')
  const recentText = recentMessages
    .map((m) => [m.body, m.share?.title, m.share?.description].filter(Boolean).join(' '))
    .join(' ')
  const tokens = new Set(tokenize(recentText))
  if (tokens.size < 2 || !shares.length) {
    return { suggest: false, reason: 'weak_context' }
  }

  const scored = shares
    .map((s) => {
      const bag = tokenize([s.title, s.description, s.kind, s.platform].filter(Boolean).join(' '))
      let hit = 0
      for (const t of bag) if (tokens.has(t)) hit += 1
      const score = bag.length ? hit / Math.min(bag.length, 8) : 0
      return { share: s, score, hit }
    })
    .filter((x) => x.hit >= 2 && x.score >= 0.35)
    .sort((a, b) => b.score - a.score)

  if (scored.length < 2) {
    slog('keyword path: no chip', { scored: scored.length, reason: 'no_strong_overlap' })
    return { suggest: false, reason: 'no_strong_overlap' }
  }

  const chosen = scored.slice(0, Math.min(5, scored.length))
  const shareIds = chosen.map((c) => c.share.id)
  const titles = chosen.map((c) => c.share.title || c.share.kind).filter(Boolean)
  const title =
    titles.length <= 2
      ? titles.join(' · ') || 'Related saves'
      : `${titles[0]} + ${titles.length - 1} more`
  const summary = `Saved material that overlaps this thread: ${titles.slice(0, 3).join(', ')}.`

  slog('keyword path: suggesting', { shareIds, title })
  return {
    suggest: true,
    title: String(title).slice(0, 80),
    summary: String(summary).slice(0, 160),
    shareIds,
    provenance: {
      model: null,
      method: 'keyword_overlap',
      prompt: null,
      params: { minHits: 2, minScore: 0.35 },
      candidates: scored.slice(0, 8).map((c) => ({
        id: c.share.id,
        title: c.share.title,
        score: Number(c.score.toFixed(3)),
        hit: c.hit,
      })),
      chosen: shareIds,
      triggerMessageIds: recentMessages.map((m) => m.id).filter(Boolean),
      createdAt: new Date().toISOString(),
    },
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

async function callGemini(model, apiKey, system, user) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    }),
  })
  const bodyText = await resp.text()
  if (!resp.ok) {
    const err = new Error(`Gemini ${model} ${resp.status}: ${bodyText.slice(0, 240)}`)
    err.status = resp.status
    err.body = bodyText
    throw err
  }
  let data
  try {
    data = JSON.parse(bodyText)
  } catch {
    throw new Error(`Gemini ${model} bad JSON envelope`)
  }
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || ''
  return text
}

async function geminiSuggest(recentMessages, shares, apiKey) {
  const catalog = shares.map((s) => ({
    id: s.id,
    kind: s.kind,
    title: s.title || '',
    description: (s.description || '').slice(0, 200),
    href: s.href || null,
    platform: s.platform || null,
  }))
  const recent = recentMessages.slice(-12).map((m) => ({
    id: m.id,
    kind: m.kind,
    body: (m.body || '').slice(0, 400),
    author_id: m.author_id,
  }))

  slog('step: build catalog from original_shares', {
    shareCount: shares.length,
    kinds: shares.reduce((a, s) => ((a[s.kind] = (a[s.kind] || 0) + 1), a), {}),
  })
  slog('step: take last messages as context', {
    recentCount: recentMessages.length,
    preview: recentMessages.slice(-3).map((m) => ({
      kind: m.kind,
      body: String(m.body || '').slice(0, 80),
    })),
  })
  slog('step: call Gemini once (not streaming / not continuous)', {
    models: GEMINI_MODELS,
  })
  const system = `You are a quiet library assistant for a two-person private chat.
Decide whether saved original_shares clearly help the current conversation.
HIGH BAR: only suggest when overlap is obvious and useful. Prefer suggest=false.
Never invent share ids — pick only from the catalog.
Return JSON only: {"suggest":boolean,"title":string,"summary":string,"shareIds":string[]}
If suggest=true: title ≤80 chars, summary one line ≤160 chars, shareIds 2–5 real ids.
If suggest=false: empty title/summary and shareIds=[].`

  const user = JSON.stringify({ recentMessages: recent, catalog })

  let usedModel = null
  let rawText = ''
  let lastErr = null
  for (const model of GEMINI_MODELS) {
    try {
      rawText = await callGemini(model, apiKey, system, user)
      usedModel = model
      break
    } catch (e) {
      lastErr = e
      // Try next model on 404 / not found / unavailable
      const msg = String(e.message || e)
      if (/404|not found|NOT_FOUND|unavailable|403/i.test(msg) && model !== GEMINI_MODELS.at(-1)) {
        continue
      }
      throw e
    }
  }
  if (!usedModel) throw lastErr || new Error('Gemini unavailable')
  slog('gemini raw', { model: usedModel, chars: rawText.length, preview: rawText.slice(0, 200) })

  const parsed = extractJsonObject(rawText)
  if (!parsed) {
    return { suggest: false, reason: 'bad_model_json' }
  }

  const allowed = new Set(shares.map((s) => s.id))
  const shareIds = Array.isArray(parsed.shareIds)
    ? [...new Set(parsed.shareIds.filter((id) => typeof id === 'string' && allowed.has(id)))]
    : []

  const baseProvenance = {
    model: usedModel,
    method: 'gemini',
    prompt: { system, userChars: user.length },
    params: { temperature: 0.2, responseMimeType: 'application/json' },
    candidates: catalog.map((c) => c.id),
    triggerMessageIds: recent.map((m) => m.id).filter(Boolean),
    createdAt: new Date().toISOString(),
  }

  slog('step: Gemini decision', {
    suggest: parsed.suggest,
    title: parsed.title,
    shareIds,
    rejectedIds: Array.isArray(parsed.shareIds)
      ? parsed.shareIds.filter((id) => !allowed.has(id))
      : [],
  })

  if (!parsed.suggest || shareIds.length < 2) {
    slog('step: no chip', {
      reason: parsed.suggest ? 'invalid_or_few_ids' : 'model_declined',
    })
    return {
      suggest: false,
      reason: parsed.suggest ? 'invalid_or_few_ids' : 'model_declined',
      provenance: { ...baseProvenance, chosen: [], rawModel: parsed },
    }
  }

  const picked = shareIds.slice(0, 5)
  slog('step: chip proposal ready', {
    title: parsed.title,
    shareIds: picked,
    model: usedModel,
  })
  return {
    suggest: true,
    title: String(parsed.title || 'Related saves').slice(0, 80),
    summary: String(parsed.summary || '').slice(0, 160),
    shareIds: picked,
    provenance: { ...baseProvenance, chosen: picked },
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
  if (!serviceKey) {
    return json(res, 500, {
      error: 'Server missing SUPABASE_SERVICE_ROLE_KEY (needed for DB reads)',
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

  const conversationId = body.conversationId
  const recentMessages = Array.isArray(body.recentMessages) ? body.recentMessages : []
  const authorId = body.authorId
  activeTrace = []
  slog('request', {
    conversationId,
    authorId,
    recentCount: recentMessages.length,
    geminiKey: Boolean(geminiKey),
  })

  if (!conversationId) return json(res, 400, { error: 'conversationId required' })

  const authClient = createClient(supabaseUrl, authKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userErr } = await authClient.auth.getUser(token)
  if (userErr || !userData?.user) {
    console.warn('suggest auth failed', userErr?.message || userErr)
    return json(res, 401, { error: 'Invalid or expired token' })
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const user = userData.user
  if (authorId && authorId !== user.id) {
    return json(res, 403, { error: 'authorId mismatch' })
  }

  const { data: member, error: memErr } = await admin
    .from('conversation_members')
    .select('user_id')
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (memErr || !member) {
    return json(res, 403, { error: 'Not a conversation member' })
  }

  const { data: shares, error: shareErr } = await admin
    .from('original_shares')
    .select('id, kind, title, description, href, platform, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(80)

  if (shareErr) {
    return json(res, 500, { error: shareErr.message })
  }

  const list = shares || []
  slog('step: loaded original_shares for conversation', {
    count: list.length,
    sample: list.slice(0, 5).map((s) => ({ id: s.id, kind: s.kind, title: s.title })),
  })
  if (list.length < 2) {
    slog('step: no chip — need ≥2 shares in corpus')
    return json(res, 200, { suggest: false, reason: 'too_few_shares' })
  }

  try {
    let result
    if (geminiKey) {
      try {
        result = await geminiSuggest(recentMessages, list, geminiKey)
      } catch (e) {
        console.error('gemini suggest failed, falling back', e)
        result = keywordSuggest(recentMessages, list)
        if (result.provenance) {
          result.provenance.geminiError = String(e.message || e).slice(0, 200)
          result.provenance.fallback = true
        }
      }
    } else {
      result = keywordSuggest(recentMessages, list)
    }
    slog('response', { suggest: result?.suggest, reason: result?.reason, method: result?.provenance?.method, model: result?.provenance?.model, shareIds: result?.shareIds })
    const trace = activeTrace || []
    activeTrace = null
    return json(res, 200, { ...result, trace })
  } catch (e) {
    console.error(e)
    return json(res, 500, { error: String(e.message || e) })
  }
}
