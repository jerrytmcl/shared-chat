import { useState, useEffect, useCallback, useRef } from 'react'
import {
  supabase,
  isSupabaseConfigured,
  CONVERSATION_ID,
  STORAGE_BUCKET,
} from '../lib/supabase'
import { DEMO_MESSAGES, DEMO_USER } from '../lib/demoData'
import { platformFromUrl, detectKindFromFile } from '../lib/groupMessages'
import { debugLog } from '../lib/debugLog'

const SUGGEST_DEBOUNCE_MS = 600
const RECENT_WINDOW = 12
const CHIP_DEDUP_LOOKBACK = 8
const RECENT_LOAD_MS = 5 * 60 * 1000

function mapRow(row, profiles = {}) {
  const author = profiles[row.author_id]
  return {
    id: row.id,
    author_id: row.author_id,
    author_name: author?.display_name || author?.email?.split('@')[0] || 'Member',
    kind: row.kind,
    body: row.body || '',
    share: row.share || null,
    share_id: row.share_id,
    package_id: row.package_id,
    package: row.package || null,
    packageShares: row.packageShares || null,
    chip_payload: row.chip_payload,
    source_ids: row.source_ids,
    created_at: row.created_at,
  }
}

function publicUrl(storagePath) {
  if (!storagePath || !supabase) return null
  return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath).data
    .publicUrl
}

function enrichShare(share) {
  if (!share) return null
  return {
    ...share,
    url: share.storage_path ? publicUrl(share.storage_path) : share.url || null,
  }
}

function fingerprintWindow(messages) {
  const slice = messages.slice(-RECENT_WINDOW)
  const ids = slice.map((m) => m.id).filter(Boolean)
  const texts = slice
    .map((m) => (m.body || '').trim().toLowerCase().slice(0, 80))
    .join('|')
  return `${ids.join(',')}:${texts}`.slice(0, 400)
}

function hasRecentChip(messages) {
  return messages.slice(-CHIP_DEDUP_LOOKBACK).some((m) => m.kind === 'chip')
}

/**
 * Messages + original shares + Phase 3 chip/package.
 * Realtime when Supabase configured; local demo state otherwise.
 */
export function useMessages(user) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const profilesRef = useRef({})
  const messagesRef = useRef([])
  const suggestTimer = useRef(null)
  const suggestInFlight = useRef(false)
  const lastFingerprint = useRef('')

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const resolvePackages = useCallback(async (mapped) => {
    if (!supabase) return mapped
    const packageIds = [
      ...new Set(
        mapped.filter((m) => m.kind === 'package' && m.package_id).map((m) => m.package_id)
      ),
    ]
    if (!packageIds.length) return mapped

    const { data: pkgs } = await supabase
      .from('living_packages')
      .select('id, title, summary, share_ids, provenance, created_at')
      .in('id', packageIds)

    const pkgById = Object.fromEntries((pkgs || []).map((p) => [p.id, p]))
    const allShareIds = [
      ...new Set((pkgs || []).flatMap((p) => p.share_ids || [])),
    ]
    let shareById = {}
    if (allShareIds.length) {
      const { data: shares } = await supabase
        .from('original_shares')
        .select(
          'id, kind, title, description, href, storage_path, mime_type, platform, metadata'
        )
        .in('id', allShareIds)
      shareById = Object.fromEntries(
        (shares || []).map((s) => [s.id, enrichShare(s)])
      )
    }

    return mapped.map((m) => {
      if (m.kind !== 'package' || !m.package_id) return m
      const pkg = pkgById[m.package_id]
      if (!pkg) return m
      const packageShares = (pkg.share_ids || [])
        .map((id) => shareById[id])
        .filter(Boolean)
      return { ...m, package: pkg, packageShares }
    })
  }, [])

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !user || user.id === DEMO_USER.id) {
      setMessages(DEMO_MESSAGES)
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const { data: members } = await supabase
        .from('conversation_members')
        .select('user_id, profiles(id, display_name, email, avatar_url)')
        .eq('conversation_id', CONVERSATION_ID)

      const profiles = {}
      for (const m of members || []) {
        if (m.profiles) profiles[m.profiles.id] = m.profiles
      }
      profilesRef.current = profiles

      const { data: rows, error } = await supabase
        .from('messages')
        .select(
          `
          id, author_id, kind, body, share_id, package_id, chip_payload, source_ids, created_at,
          share:original_shares (
            id, kind, title, description, href, storage_path, mime_type, platform, metadata
          )
        `
        )
        .eq('conversation_id', CONVERSATION_ID)
        .order('created_at', { ascending: true })

      if (error) throw error

      let mapped = (rows || []).map((r) => {
        const share = enrichShare(r.share)
        return mapRow({ ...r, share }, profiles)
      })
      mapped = await resolvePackages(mapped)
      setMessages(mapped)
    } catch (e) {
      console.error(e)
      setNotice(`Could not load messages: ${e.message}. Falling back to demo data.`)
      setMessages(DEMO_MESSAGES)
    } finally {
      setLoading(false)
    }
  }, [user, resolvePackages])

  useEffect(() => {
    load()
  }, [load])

  // Realtime subscription
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !user || user.id === DEMO_USER.id) {
      return undefined
    }

    const channel = supabase
      .channel(`messages:${CONVERSATION_ID}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${CONVERSATION_ID}`,
        },
        async (payload) => {
          const row = payload.new
          let share = null
          if (row.share_id) {
            const { data } = await supabase
              .from('original_shares')
              .select('*')
              .eq('id', row.share_id)
              .single()
            if (data) share = enrichShare(data)
          }
          let enriched = mapRow({ ...row, share }, profilesRef.current)
          if (enriched.kind === 'package' && enriched.package_id) {
            const [resolved] = await resolvePackages([enriched])
            enriched = resolved
          }
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev
            return [...prev, enriched]
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${CONVERSATION_ID}`,
        },
        (payload) => {
          const row = payload.new
          setMessages((prev) =>
            prev.map((m) =>
              m.id === row.id
                ? {
                    ...m,
                    body: row.body ?? m.body,
                    chip_payload: row.chip_payload ?? m.chip_payload,
                    package_id: row.package_id ?? m.package_id,
                  }
                : m
            )
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, resolvePackages])

  const ensureMember = useCallback(async () => {
    if (!supabase || !user || user.id === DEMO_USER.id) return { error: null }
    const { error } = await supabase.from('conversation_members').insert({
      conversation_id: CONVERSATION_ID,
      user_id: user.id,
      role: 'member',
    })
    if (error && error.code !== '23505') {
      return { error }
    }
    return { error: null }
  }, [user])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !user || user.id === DEMO_USER.id) {
      return
    }
    ensureMember().then(({ error }) => {
      if (error) setNotice(`Could not join conversation: ${error.message}`)
    })
  }, [user, ensureMember])

  const requestSuggest = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !user || user.id === DEMO_USER.id) {
      return
    }
    if (suggestInFlight.current) {
      debugLog('skip: in flight')
      return
    }

    const current = messagesRef.current
    if (hasRecentChip(current)) {
      debugLog('skip: recent chip already in thread')
      return
    }

    const fp = fingerprintWindow(current)
    if (fp && fp === lastFingerprint.current) {
      debugLog('skip: same fingerprint')
      return
    }

    const recent = current.slice(-RECENT_WINDOW).map((m) => ({
      id: m.id,
      kind: m.kind,
      body: m.body || '',
      author_id: m.author_id,
      share: m.share
        ? { title: m.share.title, description: m.share.description }
        : null,
    }))

    // Need some conversational signal
    const hasText = recent.some((m) => m.kind === 'text' && (m.body || '').trim())
    if (!hasText) return

    suggestInFlight.current = true
    debugLog('requesting…', {
      recentCount: recent.length,
      hasText,
      fingerprint: fp,
    })
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) {
        debugLog('WARN: no session token')
        return
      }

      const resp = await fetch('/api/suggest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversationId: CONVERSATION_ID,
          recentMessages: recent,
          authorId: user.id,
        }),
      })

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '')
        debugLog('WARN: HTTP', resp.status, errBody.slice(0, 300))
        return
      }

      const result = await resp.json()
      if (Array.isArray(result?.trace)) {
        for (const step of result.trace) {
          debugLog(`server: ${step.message}`, step.data)
        }
      }
      debugLog('result', {
        suggest: result?.suggest,
        reason: result?.reason,
        method: result?.provenance?.method || result?.provenance?.model,
        model: result?.provenance?.model,
        shareIds: result?.shareIds,
        title: result?.title,
      })
      if (!result?.suggest || !Array.isArray(result.shareIds) || result.shareIds.length < 2) {
        debugLog('no chip:', result?.reason || 'declined')
        return
      }

      // Re-check dedup after async
      const latest = messagesRef.current
      if (hasRecentChip(latest)) return
      const sameFp = fingerprintWindow(latest)
      if (
        latest.some(
          (m) =>
            m.kind === 'chip' &&
            m.chip_payload?.fingerprint &&
            m.chip_payload.fingerprint === sameFp
        )
      ) {
        return
      }

      const chipPayload = {
        title: result.title || 'Related saves',
        summary: result.summary || '',
        shareIds: result.shareIds,
        fingerprint: sameFp,
        provenance: result.provenance || {},
        accepted: false,
      }

      const { error } = await supabase.from('messages').insert({
        conversation_id: CONVERSATION_ID,
        author_id: user.id,
        kind: 'chip',
        body: chipPayload.title,
        chip_payload: chipPayload,
      })

      if (error) {
        debugLog('WARN: chip insert failed', error.message)
        return
      }
      debugLog('chip inserted', chipPayload.title)
      lastFingerprint.current = sameFp
    } catch (e) {
      debugLog('WARN: error', e)
    } finally {
      suggestInFlight.current = false
    }
  }, [user])

  const scheduleSuggest = useCallback(() => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current)
    debugLog('scheduled in', SUGGEST_DEBOUNCE_MS, 'ms (only on send, not continuous)')
    suggestTimer.current = setTimeout(() => {
      requestSuggest()
    }, SUGGEST_DEBOUNCE_MS)
  }, [requestSuggest])

  useEffect(() => {
    return () => {
      if (suggestTimer.current) clearTimeout(suggestTimer.current)
    }
  }, [])

  // After load: if last message is recent, maybe suggest
  useEffect(() => {
    if (loading || !user || user.id === DEMO_USER.id || !isSupabaseConfigured) return
    const last = messages[messages.length - 1]
    if (!last?.created_at) return
    const age = Date.now() - new Date(last.created_at).getTime()
    if (age >= 0 && age < RECENT_LOAD_MS && last.kind !== 'chip' && last.kind !== 'package') {
      scheduleSuggest()
    }
    // only on load completion
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  const sendText = useCallback(
    async (text) => {
      const value = text.trim()
      if (!value || !user) return

      const lines = value.split(/\n/).map((x) => x.trim()).filter(Boolean)
      const urls = lines.map((line) => {
        try {
          const u = new URL(line)
          return ['http:', 'https:'].includes(u.protocol) ? u : null
        } catch {
          return null
        }
      })

      if (urls.length && urls.every(Boolean)) {
        for (const url of urls) {
          await sendLinkShare(url.href)
        }
        scheduleSuggest()
        return
      }

      if (!isSupabaseConfigured || !supabase || user.id === DEMO_USER.id) {
        setMessages((ms) => [
          ...ms,
          {
            id: crypto.randomUUID(),
            author_id: user.id,
            author_name: user.display_name || 'You',
            kind: 'text',
            body: value,
            share: null,
            created_at: new Date().toISOString(),
          },
        ])
        return
      }

      const join = await ensureMember()
      if (join?.error) {
        setNotice(`Could not join conversation: ${join.error.message}`)
        return
      }

      const tempId = `temp-${crypto.randomUUID()}`
      const optimistic = {
        id: tempId,
        author_id: user.id,
        author_name: user.display_name || 'You',
        kind: 'text',
        body: value,
        share: null,
        created_at: new Date().toISOString(),
      }
      setMessages((ms) => [...ms, optimistic])

      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: CONVERSATION_ID,
          author_id: user.id,
          kind: 'text',
          body: value,
        })
        .select('id, created_at')
        .single()

      if (error) {
        setMessages((ms) => ms.filter((m) => m.id !== tempId))
        setNotice(`Message failed: ${error.message}`)
        return
      }

      setMessages((ms) =>
        ms.map((m) =>
          m.id === tempId
            ? { ...m, id: data.id, created_at: data.created_at }
            : m
        )
      )
      scheduleSuggest()
    },
    [user, ensureMember, scheduleSuggest]
  )

  const sendLinkShare = useCallback(
    async (href) => {
      if (!user) return
      const platform = platformFromUrl(href)
      let title
      try {
        const u = new URL(href)
        title = u.hostname + u.pathname
      } catch {
        title = href
      }
      const description = 'Original link saved.'

      if (!isSupabaseConfigured || !supabase || user.id === DEMO_USER.id) {
        const shareId = crypto.randomUUID()
        setMessages((ms) => [
          ...ms,
          {
            id: crypto.randomUUID(),
            author_id: user.id,
            author_name: user.display_name || 'You',
            kind: 'attachment',
            body: '',
            share: {
              id: shareId,
              kind: 'link',
              platform,
              title,
              description,
              href,
            },
            created_at: new Date().toISOString(),
          },
        ])
        return
      }

      const join = await ensureMember()
      if (join?.error) {
        setNotice(`Could not join conversation: ${join.error.message}`)
        return
      }
      const { data: share, error: shareErr } = await supabase
        .from('original_shares')
        .insert({
          conversation_id: CONVERSATION_ID,
          author_id: user.id,
          kind: 'link',
          title,
          description,
          href,
          platform,
        })
        .select()
        .single()
      if (shareErr) {
        setNotice(shareErr.message)
        return
      }
      const { error } = await supabase.from('messages').insert({
        conversation_id: CONVERSATION_ID,
        author_id: user.id,
        kind: 'attachment',
        body: '',
        share_id: share.id,
      })
      if (error) setNotice(error.message)
    },
    [user, ensureMember]
  )

  const sendFiles = useCallback(
    async (fileList) => {
      if (!user || !fileList?.length) return
      for (const file of fileList) {
        if (file.size > 20e6) {
          setNotice('Choose files smaller than 20 MB.')
          continue
        }
        const kind = detectKindFromFile(file)

        if (!isSupabaseConfigured || !supabase || user.id === DEMO_USER.id) {
          const url = await readAsDataURL(file)
          setMessages((ms) => [
            ...ms,
            {
              id: crypto.randomUUID(),
              author_id: user.id,
              author_name: user.display_name || 'You',
              kind: 'attachment',
              body: '',
              share: {
                id: crypto.randomUUID(),
                kind,
                title: file.name,
                description: `Local preview · ${Math.ceil(file.size / 1024)} KB`,
                url,
                mime_type: file.type,
              },
              created_at: new Date().toISOString(),
            },
          ])
          continue
        }

        const join = await ensureMember()
        if (join?.error) {
          setNotice(`Could not join conversation: ${join.error.message}`)
          continue
        }
        const path = `${CONVERSATION_ID}/${user.id}/${Date.now()}-${file.name}`
        const { error: upErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false })

        if (upErr) {
          setNotice(
            `Upload failed (${upErr.message}). Is the chat-media bucket configured? Falling back to local preview.`
          )
          const url = await readAsDataURL(file)
          setMessages((ms) => [
            ...ms,
            {
              id: crypto.randomUUID(),
              author_id: user.id,
              author_name: user.display_name || 'You',
              kind: 'attachment',
              body: '',
              share: {
                id: crypto.randomUUID(),
                kind,
                title: file.name,
                description: `Local preview (storage unavailable) · ${Math.ceil(file.size / 1024)} KB`,
                url,
                mime_type: file.type,
              },
              created_at: new Date().toISOString(),
            },
          ])
          continue
        }

        const { data: share, error: shareErr } = await supabase
          .from('original_shares')
          .insert({
            conversation_id: CONVERSATION_ID,
            author_id: user.id,
            kind,
            title: file.name,
            description: `${kind} · ${Math.ceil(file.size / 1024)} KB`,
            storage_path: path,
            mime_type: file.type,
            file_size: file.size,
          })
          .select()
          .single()
        if (shareErr) {
          setNotice(shareErr.message)
          continue
        }
        const { error } = await supabase.from('messages').insert({
          conversation_id: CONVERSATION_ID,
          author_id: user.id,
          kind: 'attachment',
          body: '',
          share_id: share.id,
        })
        if (error) setNotice(error.message)
      }
    },
    [user, ensureMember]
  )

  const materializePackage = useCallback(
    async (chipMessage) => {
      if (!user || !chipMessage) return
      const payload = chipMessage.chip_payload || {}
      if (payload.accepted) return
      const shareIds = Array.isArray(payload.shareIds) ? payload.shareIds : []
      if (shareIds.length < 1) {
        setNotice('Chip has no share refs.')
        return
      }

      if (!isSupabaseConfigured || !supabase || user.id === DEMO_USER.id) {
        const pkgId = crypto.randomUUID()
        const shares = shareIds
          .map((id) => {
            const src = messagesRef.current.find(
              (m) => m.share?.id === id || m.share_id === id
            )
            return src?.share || null
          })
          .filter(Boolean)
        setMessages((ms) => [
          ...ms.map((m) =>
            m.id === chipMessage.id
              ? {
                  ...m,
                  chip_payload: { ...payload, accepted: true },
                }
              : m
          ),
          {
            id: crypto.randomUUID(),
            author_id: user.id,
            author_name: user.display_name || 'You',
            kind: 'package',
            body: payload.title || 'Package',
            package_id: pkgId,
            package: {
              id: pkgId,
              title: payload.title,
              summary: payload.summary,
              share_ids: shareIds,
              provenance: payload.provenance || {},
            },
            packageShares: shares,
            created_at: new Date().toISOString(),
          },
        ])
        return
      }

      const join = await ensureMember()
      if (join?.error) {
        setNotice(`Could not join conversation: ${join.error.message}`)
        return
      }

      const provenance = {
        ...(payload.provenance || {}),
        chipMessageId: chipMessage.id,
        materializedAt: new Date().toISOString(),
        materializedBy: user.id,
        triggerMessageIds:
          payload.provenance?.triggerMessageIds ||
          messagesRef.current.slice(-RECENT_WINDOW).map((m) => m.id),
      }

      const { data: pkg, error: pkgErr } = await supabase
        .from('living_packages')
        .insert({
          conversation_id: CONVERSATION_ID,
          created_by: user.id,
          title: payload.title || 'Package',
          summary: payload.summary || '',
          share_ids: shareIds,
          provenance,
        })
        .select('id, title, summary, share_ids, provenance, created_at')
        .single()

      if (pkgErr) {
        setNotice(`Package failed: ${pkgErr.message}`)
        return
      }

      const { error: msgErr } = await supabase.from('messages').insert({
        conversation_id: CONVERSATION_ID,
        author_id: user.id,
        kind: 'package',
        body: pkg.title || '',
        package_id: pkg.id,
      })

      if (msgErr) {
        setNotice(`Package message failed: ${msgErr.message}`)
        return
      }

      // Best-effort mark chip accepted
      await supabase
        .from('messages')
        .update({
          chip_payload: { ...payload, accepted: true },
        })
        .eq('id', chipMessage.id)

      setMessages((ms) =>
        ms.map((m) =>
          m.id === chipMessage.id
            ? { ...m, chip_payload: { ...payload, accepted: true } }
            : m
        )
      )
    },
    [user, ensureMember]
  )

  return {
    messages,
    setMessages,
    loading,
    notice,
    setNotice,
    sendText,
    sendLinkShare,
    sendFiles,
    materializePackage,
    reload: load,
  }
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
