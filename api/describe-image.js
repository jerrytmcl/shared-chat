/**
 * POST /api/describe-image
 * Vision-based content understanding for screenshots and images.
 * Auth: Bearer Supabase JWT (same pattern as run-copy.js).
 *
 * Body: { shareId: 'uuid' } or { imageUrl: 'https://...' }
 * Returns: { title, description }
 * Side effect: updates original_shares if shareId provided
 *
 * Env: SUPABASE_URL, anon/service key, GEMINI_API_KEY, optional GEMINI_MODELS
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

async function fetchImageAsBase64(url) {
  const resp = await fetch(url)
  if (!resp.ok) {
    throw new Error(`Image fetch failed: ${resp.status}`)
  }
  const buffer = await resp.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')
  const contentType = resp.headers.get('content-type') || 'image/jpeg'
  return { base64, mimeType: contentType }
}

async function callGeminiVision(model, apiKey, prompt, imageData) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
  
  const parts = [
    { text: prompt },
    {
      inline_data: {
        mime_type: imageData.mimeType,
        data: imageData.base64,
      },
    },
  ]

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 200,
      },
    }),
  })

  const bodyText = await resp.text()
  if (!resp.ok) {
    const err = new Error(`Gemini vision ${model} ${resp.status}: ${bodyText.slice(0, 240)}`)
    err.status = resp.status
    throw err
  }

  let data
  try {
    data = JSON.parse(bodyText)
  } catch {
    throw new Error(`Gemini ${model} bad JSON envelope`)
  }

  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || ''
  return text.trim()
}

async function describeImage(imageUrl, apiKey) {
  const imageData = await fetchImageAsBase64(imageUrl)

  const prompt = `Describe what's in this image in 1-2 sentences. Focus on the main content, UI elements, or information visible. Be specific and factual. If it's a screenshot, mention what application or website it shows.`

  let rawText = ''
  let lastErr = null

  for (const model of GEMINI_MODELS) {
    try {
      rawText = await callGeminiVision(model, apiKey, prompt, imageData)
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

  if (!rawText) throw lastErr || new Error('Gemini vision unavailable')

  // Generate a short title from the description
  const description = rawText.slice(0, 300)
  const title = description.split(/[.!?]/)[0].slice(0, 80).trim() || 'Image'

  return { title, description }
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

  const shareId = body.shareId
  const imageUrl = body.imageUrl

  if (!shareId && !imageUrl) {
    return json(res, 400, { error: 'shareId or imageUrl required' })
  }

  const authClient = createClient(supabaseUrl, authKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userErr } = await authClient.auth.getUser(token)
  if (userErr || !userData?.user) {
    console.warn('[describe-image] auth failed', userErr?.message || userErr)
    return json(res, 401, { error: 'Invalid or expired token' })
  }

  let urlToFetch = imageUrl

  // If shareId provided, fetch the share and get its URL
  if (shareId) {
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: share, error: shareErr } = await admin
      .from('original_shares')
      .select('id, conversation_id, storage_path, href, kind')
      .eq('id', shareId)
      .maybeSingle()

    if (shareErr || !share) {
      return json(res, 404, { error: 'Share not found' })
    }

    // Check membership
    const { data: member } = await admin
      .from('conversation_members')
      .select('user_id')
      .eq('conversation_id', share.conversation_id)
      .eq('user_id', userData.user.id)
      .maybeSingle()

    if (!member) {
      return json(res, 403, { error: 'Not a conversation member' })
    }

    // Get the image URL
    if (share.storage_path) {
      const { data: urlData } = admin.storage
        .from('chat-media')
        .getPublicUrl(share.storage_path)
      urlToFetch = urlData.publicUrl
    } else if (share.href) {
      urlToFetch = share.href
    } else {
      return json(res, 400, { error: 'Share has no image URL' })
    }
  }

  if (!urlToFetch) {
    return json(res, 400, { error: 'No image URL available' })
  }

  console.log('[describe-image] processing', { shareId, url: urlToFetch })

  try {
    const result = await describeImage(urlToFetch, geminiKey)

    // Update the share if shareId was provided
    if (shareId && serviceKey) {
      const admin = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })

      await admin
        .from('original_shares')
        .update({
          title: result.title,
          description: result.description,
        })
        .eq('id', shareId)
    }

    return json(res, 200, result)
  } catch (e) {
    console.error('[describe-image] failed', e)
    return json(res, 500, {
      error: String(e.message || e).slice(0, 200),
    })
  }
}
