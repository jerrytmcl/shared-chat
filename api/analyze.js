/**
 * POST /api/analyze
 * Layered relevance analysis of materials and conversation patterns.
 * Auth: Bearer Supabase JWT (same pattern as suggest.js).
 *
 * Body: { conversationId, shareIds: [...], recentMessages?: [...] }
 * Returns: { objects: [...] }
 * Side effect: upserts into analysis_objects (and optionally analysis_relations)
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

async function analyzeShares(conversationId, shares, recentMessages, apiKey, userClient) {
  console.log('[analyze] analyzing', { conversationId, shareCount: shares.length })

  const catalog = shares.map((s) => ({
    id: s.id,
    kind: s.kind,
    title: (s.title || '').slice(0, 120),
    description: (s.description || '').slice(0, 300),
    platform: s.platform || null,
  }))

  const context = (recentMessages || []).slice(-8).map((m) => ({
    body: (m.body || '').slice(0, 300),
    kind: m.kind,
  }))

  const system = `You analyze materials shared in a two-person private chat.
Given materials (with ids), identify 2-4 layered analysis objects across three layers:

1. **surface**: immediate observable facts (topics, formats, sources)
2. **intent**: inferred purpose or direction in sharing them
3. **structure**: deeper patterns connecting multiple materials

Return JSON only:
{
  "objects": [
    {
      "layer": "surface|intent|structure",
      "statement": "clear statement of what this represents",
      "intent": "nullable; for intent layer only",
      "shareIds": ["id1", "id2"],
      "confidence": 0.0-1.0
    }
  ]
}

Rules:
- Each object must reference 1+ real shareIds from the catalog
- statement: one clear sentence
- intent field: only for intent layer; null otherwise
- Prefer 2-4 high-quality objects over many weak ones
- Focus on what's useful for future retrieval and suggestion`

  const user = JSON.stringify({ materials: catalog, recentContext: context })

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
  if (!parsed?.objects || !Array.isArray(parsed.objects)) {
    console.warn('[analyze] bad model output', { preview: rawText.slice(0, 200) })
    return { objects: [] }
  }

  const allowedIds = new Set(shares.map((s) => s.id))
  const objects = []

  for (const obj of parsed.objects) {
    if (!obj.layer || !obj.statement) continue
    if (!['surface', 'intent', 'structure'].includes(obj.layer)) continue

    const shareIds = Array.isArray(obj.shareIds)
      ? obj.shareIds.filter((id) => allowedIds.has(id))
      : []

    if (shareIds.length === 0) continue

    const messageIds = (recentMessages || []).map((m) => m.id).filter(Boolean)

    const record = {
      conversation_id: conversationId,
      layer: obj.layer,
      statement: String(obj.statement).slice(0, 500),
      intent: obj.layer === 'intent' ? String(obj.intent || '').slice(0, 300) || null : null,
      boundaries: {},
      standing: 'candidate',
      share_ids: shareIds,
      message_ids: messageIds,
      metadata: {
        model: usedModel,
        confidence: typeof obj.confidence === 'number' ? obj.confidence : 0.7,
        created_via: 'api/analyze',
      },
    }

    const { data: inserted, error: insertErr } = await userClient
      .from('analysis_objects')
      .upsert(record, { onConflict: 'id', ignoreDuplicates: false })
      .select()
      .single()

    if (insertErr) {
      console.error('[analyze] upsert failed', insertErr)
      continue
    }

    objects.push(inserted)
  }

  console.log('[analyze] created', { count: objects.length })
  return { objects }
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
  const anonKey = (
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim()
  const geminiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    ''
  ).trim()

  if (!supabaseUrl || !anonKey) {
    return json(res, 500, {
      error: 'Server missing SUPABASE_URL or SUPABASE_ANON_KEY',
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
  const recentMessages = Array.isArray(body.recentMessages) ? body.recentMessages : []

  if (!conversationId) {
    return json(res, 400, { error: 'conversationId required' })
  }

  if (shareIds.length === 0) {
    return json(res, 400, { error: 'shareIds required' })
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userErr } = await authClient.auth.getUser(token)
  if (userErr || !userData?.user) {
    console.warn('[analyze] auth failed', userErr?.message || userErr)
    return json(res, 401, { error: 'Invalid or expired token' })
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: member, error: memberErr } = await userClient
    .from('conversation_members')
    .select('user_id')
    .eq('conversation_id', conversationId)
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (memberErr) {
    console.error('[analyze] membership check failed', {
      conversationId,
      userId: userData.user.id,
      error: memberErr.message,
    })
    return json(res, 500, { error: `Membership check failed: ${memberErr.message}` })
  }

  if (!member) {
    const { error: joinErr } = await userClient
      .from('conversation_members')
      .insert({
        conversation_id: conversationId,
        user_id: userData.user.id,
        role: 'member',
      })

    if (joinErr && joinErr.code !== '23505') {
      console.error('[analyze] auto-join failed (RLS denied or other error)', {
        conversationId,
        userId: userData.user.id,
        error: joinErr.message,
        code: joinErr.code,
      })
      return json(res, 403, { error: 'Not a conversation member' })
    }

    console.log('[analyze] auto-joined user', {
      conversationId,
      userId: userData.user.id,
    })
  }

  const { data: shares, error: shareErr } = await userClient
    .from('original_shares')
    .select('id, kind, title, description, platform')
    .eq('conversation_id', conversationId)
    .in('id', shareIds)

  if (shareErr) {
    return json(res, 500, { error: shareErr.message })
  }

  if (!shares || shares.length === 0) {
    return json(res, 200, { objects: [] })
  }

  try {
    const result = await analyzeShares(conversationId, shares, recentMessages, geminiKey, userClient)
    return json(res, 200, result)
  } catch (e) {
    console.error('[analyze] error', e)
    return json(res, 500, {
      error: String(e.message || e).slice(0, 200),
    })
  }
}
