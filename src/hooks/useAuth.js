import { useState, useEffect, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { DEMO_USER } from '../lib/demoData'

/**
 * Auth: magic link + Google when Supabase is configured.
 * Demo mode: fixed local user when env is missing.
 */
export function useAuth() {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authNotice, setAuthNotice] = useState('')

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setUser(DEMO_USER)
      setSession({ demo: true })
      setLoading(false)
      return
    }

    let mounted = true

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!mounted) return
      setSession(s)
      setUser(
        s?.user
          ? {
              id: s.user.id,
              email: s.user.email,
              display_name:
                s.user.user_metadata?.full_name ||
                s.user.user_metadata?.name ||
                s.user.email?.split('@')[0] ||
                'You',
              avatar_url: s.user.user_metadata?.avatar_url,
            }
          : null
      )
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setUser(
        s?.user
          ? {
              id: s.user.id,
              email: s.user.email,
              display_name:
                s.user.user_metadata?.full_name ||
                s.user.user_metadata?.name ||
                s.user.email?.split('@')[0] ||
                'You',
              avatar_url: s.user.user_metadata?.avatar_url,
            }
          : null
      )
      setLoading(false)
    })

    return () => {
      mounted = false
      sub?.subscription?.unsubscribe()
    }
  }, [])

  const signInWithMagicLink = useCallback(async (email) => {
    if (!supabase) {
      setAuthNotice('Demo mode — configure Supabase env to enable auth.')
      return { error: null }
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) {
      setAuthNotice(error.message)
      return { error }
    }
    setAuthNotice('Check your email for the magic link.')
    return { error: null }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) {
      setAuthNotice('Demo mode — configure Supabase env to enable auth.')
      return { error: null }
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) setAuthNotice(error.message)
    return { error }
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) {
      setAuthNotice('Demo mode — already signed in as local user.')
      return
    }
    await supabase.auth.signOut()
  }, [])

  return {
    session,
    user,
    loading,
    authNotice,
    setAuthNotice,
    isDemo: !isSupabaseConfigured,
    signInWithMagicLink,
    signInWithGoogle,
    signOut,
  }
}
