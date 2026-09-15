/**
 * POST /api/suggest-focus
 * High-bar suggestion for creating a focus room from material piles.
 * Auth: Bearer Supabase JWT (same pattern as suggest.js).
 *
 * Body: { conversationId, shareIds: [...] }
 * Returns: { suggest: true, title, reason, shareIds, analysisIds } or { suggest: false }
 *
 * Env: SUPABASE_URL, service key, GEMINI_API_KEY, optional GEMINI_MODELS
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

async function suggestFocus(conversationId, shares, analysisObjects, geminiKey) {
  console.log('[suggest-focus] evaluating', {
    conversationId,
    shareCount: shares.length,
    analysisCount: analysisObjects.length,
  })

  const catalog = shares.map((s) => ({
    id: s.id,
    kind: s.kind,
    title: (s.title || '').slice(0, 120),
    description: (s.description || '').slice(0, 200),
  }))

  const analysis = analysisObjects.map((a) => ({
    id: a.id,
    layer: a.layer,
    statement: a.statement.slice(0, 200),
    shareIds: a.share_ids || [],
  }))

  const system = `You decide whether a pile of shared materials warrants a focus room (an episode of concentrated work).

HIGH BAR: Only suggest when:
- Materials form a coherent cluster (not random)
- There's actionable depth worth exploring together
- A focus episode would genuinely help, not distract

Return JSON only:
{
  "suggest": boolean,
  "title": string,
  "reason": string
}

If suggest=true:
- title: clear, thematic, ~5-8 words (NOT "Focus Room" or generic labels)
- reason: one sentence explaining why this deserves focused attention

If suggest=false:
- Empty title and reason

Examples of GOOD suggestions:
- "Coherent AI tooling research" (5 related design tools)
- "Deploy pipeline debugging materials" (error logs + docs)

Examples of BAD (don't suggest):
- Random mix of unrelated links
- Single topic with thin materials
- Already obvious, no depth to explore`

  const user = JSON.stringify({ materials: catalog, analysis })

  let rawText = ''
  let usedModel = null
  let lastErr = null

  for (const model of GEMINI_MODELS) {
    try {
      rawText = await callGemini(model, apiKey, system, user)
      usedModel = model
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

  if (!usedModel) throw lastErr || new Error('Gemini unavailable')

  const parsed = extractJsonObject(rawText)
  if (!parsed) {
    console.warn('[suggest-focus] bad model output', { preview: rawText.slice(0, 200) })
    return { suggest: false }
  }

  if (!parsed.suggest) {
    console.log('[suggest-focus] model declined')
    return { suggest: false }
  }

  const title = String(parsed.title || 'Focus Room').slice(0, 80).trim()
  const reason = String(parsed.reason || '').slice(0, 200).trim()
  const analysisIds = analysisObjects.map((a) => a.id)

  console.log('[suggest-focus] suggesting', {
    conversationId,
    title,
    reason,
    model: usedModel,
  })

  return {
    suggest: true,
    title,
    reason,
    shareIds: shares.map((s) => s.id),
    analysisIds,
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
      error: 'Server missing SUPABASE_SERVICE_ROLE_KEY',
    })
  }

  if (!geminiKey) {
    return json(res, 500, { error: 'GEMINI_API_KEY required' })
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

  const conversationId = (body.conversationId || '').trim()
  const shareIds = Array.isArray(body.shareIds) ? body.shareIds : []

  if (!conversationId) {
    return json(res, 400, { error: 'conversationId required' })
  }

  if (shareIds.length < 2) {
    console.log('[suggest-focus] too few shares', { count: shareIds.length })
    return json(res, 200, { suggest: false })
  }

  const authClient = createClient(supabaseUrl, authKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userErr } = await authClient.auth.getUser(token)
  if (userErr || !userData?.user) {
    console.warn('[suggest-focus] auth failed', userErr?.message || userErr)
    return json(res, 401, { error: 'Invalid or expired token' })
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: member, error: memberErr } = await admin
    .from('conversation_members')
    .select('user_id')
    .eq('conversation_id', conversationId)
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (memberErr) {
    console.error('[suggest-focus] member check failed', {
      conversationId,
      userId: userData.user.id,
      error: memberErr.message,
    })
    return json(res, 500, { error: `Membership check failed: ${memberErr.message}` })
  }

  if (!member) {
    const { error: joinErr } = await admin
      .from('conversation_members')
      .insert({
        conversation_id: conversationId,
        user_id: userData.user.id,
        role: 'member',
      })

    if (joinErr && joinErr.code !== '23505') {
      console.error('[suggest-focus] auto-join failed', {
        conversationId,
        userId: userData.user.id,
        error: joinErr.message,
        code: joinErr.code,
      })
      return json(res, 500, { error: `Could not join conversation: ${joinErr.message}` })
    }

    console.log('[suggest-focus] auto-joined user', {
      conversationId,
      userId: userData.user.id,
    })
  }

  const { data: shares, error: shareErr } = await admin
    .from('original_shares')
    .select('id, kind, title, description')
    .eq('conversation_id', conversationId)
    .in('id', shareIds)

  if (shareErr) {
    return json(res, 500, { error: shareErr.message })
  }

  if (!shares || shares.length < 2) {
    console.log('[suggest-focus] insufficient shares found')
    return json(res, 200, { suggest: false })
  }

  // Fetch recent analysis for these shares (if any)
  const { data: analysisObjects } = await admin
    .from('analysis_objects')
    .select('id, layer, statement, share_ids')
    .eq('conversation_id', conversationId)
    .overlaps('share_ids', shareIds)
    .order('created_at', { ascending: false })
    .limit(10)

  try {
    const result = await suggestFocus(
      conversationId,
      shares,
      analysisObjects || [],
      geminiKey
    )
    return json(res, 200, result)
  } catch (e) {
    console.error('[suggest-focus] error', e)
    return json(res, 500, {
      error: String(e.message || e).slice(0, 200),
    })
  }
}
