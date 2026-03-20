'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export type ProfileRow = {
  id: string
  display_name: string | null
  photo_url: string | null
  role: string | null
}

export type FollowRow = {
  follower_id: string
  following_id: string
  status: 'pending' | 'accepted'
}

export type FollowRequestItem = {
  follower_id: string
  following_id: string
  status: 'pending'
  follower_profile: ProfileRow | null
}

export type FeedItem = {
  id: string
  [key: string]: unknown
}

// ────────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────────

export function useCommunityData() {
  const supabase = useMemo(() => createClient(), [])
  const [userId, setUserId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [follows, setFollows] = useState<Map<string, FollowRow>>(new Map())
  const [followRequests, setFollowRequests] = useState<FollowRequestItem[]>([])
  const [loadError, setLoadError] = useState<string>('')
  const [busyId, setBusyId] = useState<string>('')
  const [busyRequestId, setBusyRequestId] = useState<string>('')
  const followerProfileCacheRef = useRef<Map<string, ProfileRow | null>>(new Map())

  // ── Feed state ──
  const [feedItems, setFeedItems] = useState<FeedItem[]>([])
  const [feedLoading, setFeedLoading] = useState(false)
  const [feedCursor, setFeedCursor] = useState<string | null>(null)
  const [feedHasMore, setFeedHasMore] = useState(true)
  const feedLoadedRef = useRef(false)

  // ── Presence state ──
  const [onlineFriends, setOnlineFriends] = useState<string[]>([])
  const [onlineFriendProfiles, setOnlineFriendProfiles] = useState<ProfileRow[]>([])

  // ── Auth ──
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data } = await supabase.auth.getUser()
        const uid = data?.user?.id ? String(data.user.id) : ''
        if (!mounted) return
        setUserId(uid)
      } catch {
        if (!mounted) return
        setUserId('')
      }
    })()
    return () => { mounted = false }
  }, [supabase])

  // ── Load follower profiles ──
  const loadFollowerProfiles = useCallback(async (ids: string[]) => {
    const safeIds = Array.from(new Set((Array.isArray(ids) ? ids : []).map((v) => String(v || '').trim()).filter(Boolean)))
    if (!safeIds.length) return new Map<string, ProfileRow | null>()
    const out = new Map<string, ProfileRow | null>()
    const missing: string[] = []
    safeIds.forEach((id) => {
      const cached = followerProfileCacheRef.current.get(id)
      if (cached !== undefined) out.set(id, cached)
      else missing.push(id)
    })
    if (!missing.length) return out
    try {
      const { data } = await supabase.from('profiles').select('id, display_name, photo_url, role').in('id', missing).limit(5000)
      const rows = Array.isArray(data) ? data : []
      const got = new Set<string>()
      rows.forEach((row: Record<string, unknown>) => {
        const id = String(row?.id || '').trim()
        if (!id) return
        got.add(id)
        const prof: ProfileRow = { id, display_name: row?.display_name ? String(row.display_name) : null, photo_url: row?.photo_url ? String(row.photo_url) : null, role: row?.role ? String(row.role) : null }
        followerProfileCacheRef.current.set(id, prof)
        out.set(id, prof)
      })
      missing.forEach((id) => { if (got.has(id)) return; followerProfileCacheRef.current.set(id, null); out.set(id, null) })
    } catch {
      missing.forEach((id) => { followerProfileCacheRef.current.set(id, null); out.set(id, null) })
    }
    return out
  }, [supabase])

  // ── Load all data ──
  const loadAll = useCallback(async (uid: string) => {
    const id = String(uid || '').trim()
    if (!id) return
    const [profilesRes, followsRes, incomingRes] = await Promise.all([
      supabase.from('profiles').select('id, display_name, photo_url, role').order('display_name', { ascending: true }).limit(500),
      supabase.from('social_follows').select('follower_id, following_id, status').eq('follower_id', id).limit(5000),
      supabase.from('social_follows').select('follower_id, following_id, status').eq('following_id', id).eq('status', 'pending').limit(5000),
    ])
    const profilesErr = profilesRes?.error ? String(profilesRes.error.message || profilesRes.error) : ''
    const followsErr = followsRes?.error ? String(followsRes.error.message || followsRes.error) : ''
    const incomingErr = incomingRes?.error ? String(incomingRes.error.message || incomingRes.error) : ''
    if (profilesErr || followsErr || incomingErr) {
      const raw = profilesErr || followsErr || incomingErr
      const lower = raw.toLowerCase()
      const msg = lower.includes('schema cache') || lower.includes('could not find the table') || lower.includes('social_follows')
        ? 'O Social System não está aplicado no Supabase (tabela social_follows ausente). Rode as migrations do Supabase e recarregue a página.'
        : raw || 'Falha ao carregar dados da comunidade.'
      setLoadError(msg)
    } else { setLoadError('') }

    const list = (Array.isArray(profilesRes?.data) ? profilesRes.data : [])
      .filter((row) => row && typeof row === 'object')
      .map((row: Record<string, unknown>) => ({ id: String(row.id), display_name: row.display_name ? String(row.display_name) : null, photo_url: row.photo_url ? String(row.photo_url) : null, role: row.role ? String(row.role) : null }))
      .filter((row) => row.id && row.id !== id)
    setProfiles(list)

    const map = new Map<string, FollowRow>()
    ;(Array.isArray(followsRes?.data) ? followsRes.data : []).forEach((row: Record<string, unknown>) => {
      const fid = String(row?.following_id || '').trim()
      if (!fid) return
      map.set(fid, { follower_id: String(row?.follower_id || '').trim(), following_id: fid, status: row?.status === 'accepted' ? 'accepted' : 'pending' })
    })
    setFollows(map)

    let incomingRows = (Array.isArray(incomingRes?.data) ? incomingRes.data : [])
      .filter((r) => r && typeof r === 'object')
      .map((r: Record<string, unknown>) => ({ follower_id: String(r?.follower_id || '').trim(), following_id: String(r?.following_id || '').trim(), status: 'pending' as const }))
      .filter((r) => r.follower_id && r.following_id)

    if ((!incomingRows.length && incomingErr) || (incomingErr && incomingRows.length === 0)) {
      try {
        const { data: notifRows } = await supabase.from('notifications').select('sender_id, metadata, read, created_at').eq('user_id', id).eq('type', 'follow_request').eq('read', false).order('created_at', { ascending: false }).limit(100)
        const followerIds = (Array.isArray(notifRows) ? notifRows : []).map((n: Record<string, unknown>) => { const meta = n?.metadata && typeof n.metadata === 'object' ? (n.metadata as Record<string, unknown>) : null; return String(n?.sender_id ?? meta?.follower_id ?? '').trim() }).filter(Boolean)
        incomingRows = Array.from(new Set(followerIds)).map((fid) => ({ follower_id: fid, following_id: id, status: 'pending' as const }))
      } catch { }
    }

    const followerIds = incomingRows.map((r) => r.follower_id)
    const profilesById = await loadFollowerProfiles(followerIds)
    setFollowRequests(incomingRows.map((r) => ({ ...r, follower_profile: profilesById.get(r.follower_id) ?? null })))
  }, [loadFollowerProfiles, supabase])

  // ── Realtime subscriptions ──
  useEffect(() => {
    if (!userId) { setLoading(false); setProfiles([]); setFollows(new Map()); setFollowRequests([]); return }
    let mounted = true
    let incomingChannel: RealtimeChannel | null = null
    let outgoingChannel: RealtimeChannel | null = null
    const run = async () => {
      setLoading(true)
      try { await loadAll(userId) } catch { if (!mounted) return; setProfiles([]); setFollows(new Map()); setFollowRequests([]) } finally { if (mounted) setLoading(false) }
    }
    run()
    try {
      incomingChannel = supabase.channel(`community:follows:incoming:${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'social_follows', filter: `following_id=eq.${userId}` }, async (payload) => {
        try {
          if (!mounted) return
          const ev = String(payload?.eventType || '').toUpperCase()
          const row = (ev === 'DELETE' ? payload?.old : payload?.new) as Record<string, unknown>
          const followerId = String(row?.follower_id || '').trim()
          const status = String(row?.status || '').trim().toLowerCase()
          if (!followerId) return
          if (ev === 'DELETE' || status !== 'pending') { setFollowRequests((prev) => prev.filter((r) => r.follower_id !== followerId)); return }
          const byId = await loadFollowerProfiles([followerId])
          const prof = byId.get(followerId) ?? null
          setFollowRequests((prev) => { const current = Array.isArray(prev) ? prev : []; const exists = current.some((r) => r?.follower_id === followerId); if (exists) return current.map((r) => (r?.follower_id === followerId ? { ...r, follower_profile: prof } : r)); return [{ follower_id: followerId, following_id: userId, status: 'pending', follower_profile: prof }, ...current] })
        } catch { }
      }).subscribe()
    } catch { }
    try {
      outgoingChannel = supabase.channel(`community:follows:outgoing:${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'social_follows', filter: `follower_id=eq.${userId}` }, (payload) => {
        try {
          if (!mounted) return
          const ev = String(payload?.eventType || '').toUpperCase()
          const row = (ev === 'DELETE' ? payload?.old : payload?.new) as Record<string, unknown>
          const followingId = String(row?.following_id || '').trim()
          const status = String(row?.status || '').trim().toLowerCase()
          if (!followingId) return
          setFollows((prev) => { const next = new Map(prev); if (ev === 'DELETE') { next.delete(followingId); return next } next.set(followingId, { follower_id: userId, following_id: followingId, status: status === 'accepted' ? 'accepted' : 'pending' }); return next })
        } catch { }
      }).subscribe()
    } catch { }
    const refresh = () => { try { if (!mounted) return; run() } catch { } }
    const handleVisibilityChange = () => { try { if (document.visibilityState === 'visible') refresh() } catch { } }
    try { document.addEventListener('visibilitychange', handleVisibilityChange); window.addEventListener('pageshow', refresh) } catch { }
    return () => {
      mounted = false
      try { if (incomingChannel) supabase.removeChannel(incomingChannel) } catch { }
      try { if (outgoingChannel) supabase.removeChannel(outgoingChannel) } catch { }
      try { document.removeEventListener('visibilitychange', handleVisibilityChange) } catch { }
      try { window.removeEventListener('pageshow', refresh) } catch { }
    }
  }, [loadAll, loadFollowerProfiles, supabase, userId])

  // ── Load feed ──
  const loadFeed = useCallback(async (reset?: boolean) => {
    if (!userId) return
    setFeedLoading(true)
    try {
      const cursor = reset ? '' : feedCursor || ''
      const url = `/api/social/feed?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
      const res = await fetch(url)
      const data = await res.json().catch(() => null)
      if (data?.ok) {
        const items = Array.isArray(data.items) ? data.items : []
        if (reset) setFeedItems(items)
        else setFeedItems((prev) => [...prev, ...items])
        setFeedCursor(data.nextCursor || null)
        setFeedHasMore(Boolean(data.nextCursor))
      }
    } catch { }
    finally { setFeedLoading(false) }
  }, [userId, feedCursor])

  // ── Load presence ──
  useEffect(() => {
    if (!userId) return
    let mounted = true
    const loadPresence = async () => {
      try {
        const res = await fetch('/api/social/presence/list')
        const data = await res.json().catch(() => null)
        if (!mounted || !data?.ok) return
        const onlineIds = Array.isArray(data.online_users) ? data.online_users.map((id: unknown) => String(id)) : []
        const followingIds = Array.from(follows.entries())
          .filter(([, f]) => f.status === 'accepted')
          .map(([id]) => id)
        const friendsOnline = onlineIds.filter((id: string) => followingIds.includes(id) && id !== userId)
        setOnlineFriends(friendsOnline)
        const profs = friendsOnline.map((id: string) => profiles.find((p) => p.id === id)).filter(Boolean) as ProfileRow[]
        setOnlineFriendProfiles(profs)
      } catch { }
    }
    loadPresence()
    const interval = setInterval(loadPresence, 30_000)
    return () => { mounted = false; clearInterval(interval) }
  }, [userId, follows, profiles])

  // ── Actions ──
  const respondFollowRequest = useCallback(async (followerId: string, decision: 'accept' | 'deny') => {
    const fid = String(followerId || '').trim()
    if (!fid || !userId || busyRequestId) return
    setBusyRequestId(fid)
    try {
      const res = await fetch('/api/social/follow/respond', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ follower_id: fid, decision }) })
      const data = await res.json().catch((): null => null)
      if (!data?.ok) {
        const raw = String(data?.error || 'Falha ao responder')
        const lower = raw.toLowerCase()
        const msg = lower.includes('schema cache') || lower.includes('could not find the table') || lower.includes('social_follows') ? 'O Social System não está aplicado no Supabase (tabela social_follows ausente).' : lower.includes('replica identity') ? 'Falha ao atualizar a solicitação. Rode as migrations.' : raw
        if (typeof window !== 'undefined') window.alert(msg)
        return
      }
      setFollowRequests((prev) => prev.filter((r) => r.follower_id !== fid))
    } catch (e) { if (typeof window !== 'undefined') window.alert(e instanceof Error ? e.message : String(e)) }
    finally { setBusyRequestId('') }
  }, [userId, busyRequestId])

  const cancelFollowRequest = useCallback(async (profileId: string) => {
    const pid = String(profileId || '').trim()
    if (!pid || !userId || busyId) return
    setBusyId(pid)
    try {
      const res = await fetch('/api/social/follow/cancel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ following_id: pid }) })
      const data = await res.json().catch((): null => null)
      if (!data?.ok) { const raw = String(data?.error || 'Falha ao cancelar'); if (typeof window !== 'undefined') window.alert(raw); return }
      const status = String(data?.status || '').trim().toLowerCase()
      const already = data?.already === true
      if (!already || status !== 'accepted') setFollows((prev) => { const next = new Map(prev); next.delete(pid); return next })
      try { await loadAll(userId) } catch { }
    } catch (e) { if (typeof window !== 'undefined') window.alert(e instanceof Error ? e.message : String(e)) }
    finally { setBusyId('') }
  }, [userId, busyId, loadAll])

  const follow = useCallback(async (profileId: string, showMessage: (msg: string) => void) => {
    const pid = String(profileId || '').trim()
    if (!pid || !userId || busyId) return
    setBusyId(pid)
    const rollback = new Map(follows)
    setFollows((prev) => { const next = new Map(prev); next.set(pid, { follower_id: userId, following_id: pid, status: 'pending' }); return next })
    try {
      const res = await fetch('/api/social/follow', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ following_id: pid }) })
      const data = await res.json().catch((): null => null)
      if (!data?.ok) {
        setFollows(rollback)
        const raw = String(data?.error || 'Falha ao seguir')
        const lower = raw.toLowerCase()
        const msg = lower.includes('user_not_accepting_follows') ? 'Este usuário não está aceitando convites para seguir.' : lower.includes('schema cache') || lower.includes('social_follows') ? 'O Social System não está aplicado no Supabase.' : raw
        showMessage(msg)
        return
      }
      try { if (data?.notified === false && typeof window !== 'undefined') showMessage('Convite enviado. O usuário pode ter desativado notificações sociais.') } catch { }
    } catch (e) { setFollows(rollback); showMessage(e instanceof Error ? e.message : String(e)) }
    finally { setBusyId('') }
  }, [userId, busyId, follows])

  const unfollow = useCallback(async (profileId: string) => {
    const pid = String(profileId || '').trim()
    if (!pid || !userId || busyId) return
    setBusyId(pid)
    const rollback = new Map(follows)
    setFollows((prev) => { const next = new Map(prev); next.delete(pid); return next })
    try {
      const { error } = await supabase.from('social_follows').delete().eq('follower_id', userId).eq('following_id', pid)
      if (error) throw error
      try { await supabase.from('notifications').delete().eq('user_id', userId).eq('sender_id', pid) } catch { }
    } catch (e) { setFollows(rollback); if (typeof window !== 'undefined') window.alert(e instanceof Error ? e.message : String(e)) }
    finally { setBusyId('') }
  }, [userId, busyId, follows, supabase])

  return {
    supabase,
    userId,
    loading,
    profiles,
    follows,
    followRequests,
    loadError,
    busyId,
    busyRequestId,
    // Feed
    feedItems,
    feedLoading,
    feedHasMore,
    feedLoadedRef,
    loadFeed,
    // Presence
    onlineFriends,
    onlineFriendProfiles,
    // Actions
    respondFollowRequest,
    cancelFollowRequest,
    follow,
    unfollow,
  }
}
