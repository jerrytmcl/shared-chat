import { useState, useEffect, useCallback, useRef } from 'react'
import {
  supabase,
  isSupabaseConfigured,
  CONVERSATION_ID,
  STORAGE_BUCKET,
} from '../lib/supabase'
import { DEMO_MESSAGES, DEMO_USER } from '../lib/demoData'
import { platformFromUrl, detectKindFromFile } from '../lib/groupMessages'

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
    chip_payload: row.chip_payload,
    source_ids: row.source_ids,
    created_at: row.created_at,
  }
}

/**
 * Messages + original shares.
 * Realtime when Supabase configured; local demo state otherwise.
 */
export function useMessages(user) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const profilesRef = useRef({})

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

      const mapped = (rows || []).map((r) => {
        const share = r.share
          ? {
              ...r.share,
              url: r.share.storage_path
                ? supabase.storage
                    .from(STORAGE_BUCKET)
                    .getPublicUrl(r.share.storage_path).data.publicUrl
                : null,
            }
          : null
        return mapRow({ ...r, share }, profiles)
      })
      setMessages(mapped)
    } catch (e) {
      console.error(e)
      setNotice(`Could not load messages: ${e.message}. Falling back to demo data.`)
      setMessages(DEMO_MESSAGES)
    } finally {
      setLoading(false)
    }
  }, [user])

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
            if (data) {
              share = {
                ...data,
                url: data.storage_path
                  ? supabase.storage
                      .from(STORAGE_BUCKET)
                      .getPublicUrl(data.storage_path).data.publicUrl
                  : null,
              }
            }
          }
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev
            return [...prev, mapRow({ ...row, share }, profilesRef.current)]
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  const ensureMember = useCallback(async () => {
    if (!supabase || !user || user.id === DEMO_USER.id) return { error: null }
    // Prefer insert; ignore duplicate. Avoid upsert (needs UPDATE RLS).
    const { error } = await supabase.from('conversation_members').insert({
      conversation_id: CONVERSATION_ID,
      user_id: user.id,
      role: 'member',
    })
    if (error && error.code !== '23505') {
      // 23505 = unique_violation (already a member)
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

  const sendText = useCallback(
    async (text) => {
      const value = text.trim()
      if (!value || !user) return

      // Newline-separated URLs → link shares
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
    },
    [user, ensureMember]
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

  return {
    messages,
    setMessages,
    loading,
    notice,
    setNotice,
    sendText,
    sendLinkShare,
    sendFiles,
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
