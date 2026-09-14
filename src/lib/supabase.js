import { createClient } from '@supabase/supabase-js'

/** Bare project origin only — /rest/v1 etc. causes "Invalid path specified in request URL". */
function normalizeSupabaseUrl(raw) {
  const s = (raw || '').trim()
  if (!s) return ''
  try {
    const u = new URL(s)
    return u.origin
  } catch {
    return s.replace(/\/+$/, '').replace(/\/rest\/v1$/i, '').replace(/\/auth\/v1$/i, '')
  }
}

const url = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL || '')
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

/** True when both URL and anon key look configured. */
export const isSupabaseConfigured = Boolean(
  url &&
    anonKey &&
    !url.includes('YOUR_PROJECT') &&
    anonKey !== 'your_anon_public_key' &&
    !anonKey.includes('your_anon')
)

export const CONVERSATION_ID =
  import.meta.env.VITE_CONVERSATION_ID ||
  '00000000-0000-4000-8000-000000000001'

export const STORAGE_BUCKET = 'chat-media'

/** Supabase client, or null in local/demo mode. */
export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
