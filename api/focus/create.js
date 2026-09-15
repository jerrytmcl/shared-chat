/**
 * POST /api/focus/create
 * Create a focus room from accepted suggestion.
 * Auth: Bearer Supabase JWT (same pattern as other APIs).
 *
 * Body: { conversationId, title, shareIds: [...], analysisIds?: [...] }
 * Returns: { roomId, title }
 *
 * Env: SUPABASE_URL, service key
 */

import { createClient } from '@supabase/supabase-js'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

  if (!supabaseUrl || !anonKey) {
    return json(res, 500, {
      error: 'Server missing SUPABASE_URL or SUPABASE_ANON_KEY',
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

  const conversationId = (body.conversationId || '').trim()
  const title = body.title
  const shareIds = Array.isArray(body.shareIds) ? body.shareIds : []
  const analysisIds = Array.isArray(body.analysisIds) ? body.analysisIds : []

  if (!conversationId || !title) {
    return json(res, 400, { error: 'conversationId and title required' })
  }

  if (shareIds.length === 0) {
    return json(res, 400, { error: 'shareIds required (at least one)' })
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userErr } = await authClient.auth.getUser(token)
  if (userErr || !userData?.user) {
    console.warn('[focus/create] auth failed', userErr?.message || userErr)
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
    console.error('[focus/create] membership check failed', {
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
      console.error('[focus/create] auto-join failed (RLS denied or other error)', {
        conversationId,
        userId: userData.user.id,
        error: joinErr.message,
        code: joinErr.code,
      })
      return json(res, 403, { error: 'Not a conversation member' })
    }

    console.log('[focus/create] auto-joined user', {
      conversationId,
      userId: userData.user.id,
    })
  }

  console.log('[focus/create] verified member, creating room', {
    conversationId,
    userId: userData.user.id,
    title,
    shareCount: shareIds.length,
  })

  try {
    // Create the focus room
    const { data: room, error: roomErr } = await userClient
      .from('focus_rooms')
      .insert({
        conversation_id: conversationId,
        title: String(title).slice(0, 200),
        summary: analysisIds.length > 0 ? 'Created from analyzed materials' : null,
        status: 'open',
        created_from: 'pile',
        created_by: userData.user.id,
      })
      .select()
      .single()

    if (roomErr) {
      console.error('[focus/create] room insert failed', roomErr)
      return json(res, 500, { error: roomErr.message })
    }

    // Insert focus items (room-share associations)
    const items = shareIds.map((shareId) => ({
      focus_room_id: room.id,
      share_id: shareId,
    }))

    const { error: itemsErr } = await userClient
      .from('focus_items')
      .insert(items)

    if (itemsErr) {
      console.error('[focus/create] items insert failed', itemsErr)
      // Room exists but items failed; client can retry or handle
      return json(res, 500, { error: itemsErr.message })
    }

    console.log('[focus/create] success', {
      roomId: room.id,
      conversationId,
      userId: userData.user.id,
    })

    return json(res, 200, {
      roomId: room.id,
      title: room.title,
    })
  } catch (e) {
    console.error('[focus/create] error', e)
    return json(res, 500, {
      error: String(e.message || e).slice(0, 200),
    })
  }
}
