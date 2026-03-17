'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { useUserSettings } from '@/hooks/useUserSettings'
import { InAppNotificationsProvider, useInAppNotifications } from '@/contexts/InAppNotificationsContext'
import { ArrowLeft, Search, Settings, UserPlus, UserMinus, Users, Check, X, Clock, Bell, Loader2, Rss, Trophy, Radio } from 'lucide-react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import FeedCard from './FeedCard'
import type { FeedItem } from './FeedCard'
import UserProfileModal from './UserProfileModal'
import LeaderboardPanel from './LeaderboardPanel'

type CommunityTab = 'feed' | 'follow' | 'ranking'

type ProfileRow = {
  id: string
  display_name: string | null
  photo_url: string | null
  role: string | null
}

type FollowRow = {
  follower_id: string
  following_id: string
  status: 'pending' | 'accepted'
}

type FollowRequestItem = {
  follower_id: string
  following_id: string
  status: 'pending'
  follower_profile: ProfileRow | null
}

const safeString = (v: unknown): string => (v === null || v === undefined ? '' : String(v))

const formatRoleLabel = (raw: unknown): string => {
  const r = String(raw || '').trim().toLowerCase()
  if (r === 'teacher') return 'PROFESSOR'
  if (r === 'admin') return 'ADMIN'
  if (r === 'user') return 'ALUNO'
  return r ? r.toUpperCase() : 'ALUNO'
}

const getRoleColor = (raw: unknown): string => {
  const r = String(raw || '').trim().toLowerCase()
  if (r === 'teacher') return 'text-amber-400'
  if (r === 'admin') return 'text-yellow-300'
  return 'text-neutral-400'
}

const GoldGradientBorder = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div
    className={`rounded-2xl p-[1px] ${className}`}
    style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.4) 0%, rgba(255,255,255,0.05) 50%, rgba(234,179,8,0.15) 100%)' }}
  >
    <div className="rounded-[15px] overflow-hidden h-full" style={{ background: 'rgba(15,15,15,0.98)' }}>
      {children}
    </div>
  </div>
)

const Avatar = ({ photo, name, size = 44 }: { photo?: string | null; name: string; size?: number }) => {
  const initials = name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div
      className="rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 relative"
      style={{
        width: size,
        height: size,
        background: photo ? 'transparent' : 'linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)',
        boxShadow: '0 0 0 1.5px rgba(234,179,8,0.25), 0 4px 12px rgba(0,0,0,0.4)',
      }}
    >
      {photo ? (
        <Image src={photo} alt="" width={size} height={size} className="w-full h-full object-cover" unoptimized />
      ) : (
        <span className="font-black text-yellow-500/80" style={{ fontSize: size * 0.36 }}>{initials || '?'}</span>
      )}
    </div>
  )
}

const GoldButton = ({
  onClick, disabled, children, variant = 'gold', className = ''
}: {
  onClick?: () => void
  disabled?: boolean
  children: React.ReactNode
  variant?: 'gold' | 'ghost' | 'danger'
  className?: string
}) => {
  const styles = {
    gold: {
      background: disabled ? 'rgba(234,179,8,0.2)' : 'linear-gradient(135deg, #f59e0b 0%, #d97706 60%, #b45309 100%)',
      color: disabled ? 'rgba(0,0,0,0.4)' : '#000',
      boxShadow: disabled ? 'none' : '0 4px 16px rgba(234,179,8,0.3)',
    },
    ghost: {
      background: 'rgba(255,255,255,0.04)',
      color: disabled ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.7)',
      border: '1px solid rgba(255,255,255,0.08)',
    },
    danger: {
      background: 'rgba(239,68,68,0.08)',
      color: disabled ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.85)',
      border: '1px solid rgba(239,68,68,0.2)',
    },
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-black text-xs transition-all duration-150 active:scale-95 ${disabled ? 'cursor-not-allowed' : 'hover:opacity-90'} ${className}`}
      style={styles[variant]}
    >
      {children}
    </button>
  )
}

export default function CommunityClient({ embedded }: { embedded?: boolean }) {
  if (embedded) return <CommunityClientInner embedded />
  return (
    <InAppNotificationsProvider>
      <CommunityClientInner />
    </InAppNotificationsProvider>
  )
}

function CommunityClientInner({ embedded }: { embedded?: boolean }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { notify } = useInAppNotifications()
  const [userId, setUserId] = useState<string>('')
  const userSettingsApi = useUserSettings(userId)
  const [communitySettingsOpen, setCommunitySettingsOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [follows, setFollows] = useState<Map<string, FollowRow>>(new Map())
  const [followRequests, setFollowRequests] = useState<FollowRequestItem[]>([])
  const [loadError, setLoadError] = useState<string>('')
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string>('')
  const [busyRequestId, setBusyRequestId] = useState<string>('')
  const followerProfileCacheRef = useRef<Map<string, ProfileRow | null>>(new Map())

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState<CommunityTab>('feed')

  // ── Feed state ──
  const [feedItems, setFeedItems] = useState<FeedItem[]>([])
  const [feedLoading, setFeedLoading] = useState(false)
  const [feedCursor, setFeedCursor] = useState<string | null>(null)
  const [feedHasMore, setFeedHasMore] = useState(true)
  const feedLoadedRef = useRef(false)

  // ── Presence state ──
  const [onlineFriends, setOnlineFriends] = useState<string[]>([])
  const [onlineFriendProfiles, setOnlineFriendProfiles] = useState<ProfileRow[]>([])

  // ── Profile modal state ──
  const [profileModalUserId, setProfileModalUserId] = useState<string | null>(null)

  const showMessage = useCallback(
    (text: string) => {
      const msg = String(text || '').trim()
      if (!msg) return
      const allowToasts = Boolean(userSettingsApi?.settings?.inAppToasts ?? true)
      if (allowToasts) {
        notify({ text: msg, senderName: 'Comunidade', displayName: 'Comunidade', photoURL: undefined, type: 'info' })
        return
      }
      try { if (typeof window !== 'undefined') window.alert(msg) } catch { }
    },
    [notify, userSettingsApi?.settings?.inAppToasts]
  )

  const communityEnabled = Boolean(userSettingsApi?.settings?.moduleCommunity ?? true)

  useEffect(() => {
    let mounted = true
      ; (async () => {
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
      ; (Array.isArray(followsRes?.data) ? followsRes.data : []).forEach((row: Record<string, unknown>) => {
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

  useEffect(() => {
    if (userId && activeTab === 'feed' && !feedLoadedRef.current) {
      feedLoadedRef.current = true
      loadFeed(true)
    }
  }, [userId, activeTab, loadFeed])

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
        // Filter to only friends I follow
        const followingIds = Array.from(follows.entries())
          .filter(([, f]) => f.status === 'accepted')
          .map(([id]) => id)
        const friendsOnline = onlineIds.filter((id: string) => followingIds.includes(id) && id !== userId)
        setOnlineFriends(friendsOnline)
        // Match profiles
        const profs = friendsOnline.map((id: string) => profiles.find((p) => p.id === id)).filter(Boolean) as ProfileRow[]
        setOnlineFriendProfiles(profs)
      } catch { }
    }
    loadPresence()
    const interval = setInterval(loadPresence, 30_000)
    return () => { mounted = false; clearInterval(interval) }
  }, [userId, follows, profiles])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = Array.isArray(profiles) ? profiles : []
    if (!q) return base
    return base.filter((p) => { const name = safeString(p.display_name).toLowerCase(); const role = safeString(p.role).toLowerCase(); return name.includes(q) || role.includes(q) })
  }, [profiles, query])

  const respondFollowRequest = async (followerId: string, decision: 'accept' | 'deny') => {
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
  }

  const cancelFollowRequest = async (profileId: string) => {
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
  }

  const follow = async (profileId: string) => {
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
  }

  const unfollow = async (profileId: string) => {
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
  }

  const ToggleButton = ({ settingKey, label, description }: { settingKey: string; label: string; description: string }) => {
    const isOn = Boolean((userSettingsApi?.settings as Record<string, unknown>)?.[settingKey] ?? true)
    return (
      <div className="flex items-center justify-between gap-3 py-3 border-b border-white/5 last:border-0">
        <div className="min-w-0">
          <div className="text-sm font-bold text-white">{label}</div>
          <div className="text-xs text-neutral-500 mt-0.5">{description}</div>
        </div>
        <button
          type="button"
          onClick={() => userSettingsApi.updateSetting(settingKey, !isOn)}
          className={`relative flex-shrink-0 w-12 h-6 rounded-full transition-all duration-300 ${isOn ? 'bg-yellow-500' : 'bg-neutral-700'}`}
          style={isOn ? { boxShadow: '0 0 12px rgba(234,179,8,0.4)' } : {}}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-lg transition-all duration-300 ${isOn ? 'left-6' : 'left-0.5'}`}
          />
        </button>
      </div>
    )
  }

  if (userId && userSettingsApi?.loaded && !communityEnabled) {
    return (
      <div className={embedded ? '' : 'min-h-screen bg-neutral-950 text-white p-4 pt-safe'}>
        <div className={embedded ? 'space-y-4' : 'max-w-3xl mx-auto space-y-4'}>
          {!embedded && (
            <button type="button" onClick={() => router.push('/dashboard')} className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black hover:bg-neutral-800 active:scale-95 transition-all">
              Voltar ao Dashboard
            </button>
          )}
          <GoldGradientBorder>
            <div className="p-5">
              <div className="text-xs font-black uppercase tracking-widest text-yellow-500 mb-1">Comunidade</div>
              <div className="text-lg font-black text-white">Módulo desativado</div>
              <div className="text-sm text-neutral-400 mt-1">Ative em Configurações → Módulos opcionais.</div>
            </div>
          </GoldGradientBorder>
        </div>
      </div>
    )
  }

  return (
    <div className={embedded ? '' : 'min-h-screen bg-neutral-950 text-white p-4 pt-safe'}>
      <div className={embedded ? 'space-y-3' : 'max-w-4xl mx-auto space-y-3'}>

        {/* ── Header Card ── */}
        <GoldGradientBorder>
          <div className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {!embedded && (
                  <button
                    type="button"
                    onClick={() => { try { if (typeof window !== 'undefined' && window.history.length > 1) router.back(); else router.push('/dashboard') } catch { router.push('/dashboard') } }}
                    className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center transition-all hover:bg-white/5"
                    style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}
                    aria-label="Voltar"
                  >
                    <ArrowLeft size={18} className="text-neutral-300" />
                  </button>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <div
                      className="text-[10px] font-black uppercase tracking-[0.18em] px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(234,179,8,0.12)', color: '#f59e0b', border: '1px solid rgba(234,179,8,0.2)' }}
                    >
                      Comunidade
                    </div>
                  </div>
                  <div className="text-white font-black text-xl leading-tight truncate flex items-center gap-2">
                    <Users size={18} className="text-yellow-500 flex-shrink-0" />
                    {activeTab === 'feed' ? 'Atividades' : activeTab === 'ranking' ? 'Ranking' : 'Seguir Amigos'}
                  </div>
                  <div className="text-xs text-neutral-500 mt-0.5">
                    {activeTab === 'feed' ? 'Veja o que seus amigos estão fazendo.' : activeTab === 'ranking' ? 'Ranking semanal entre amigos.' : 'Siga alunos e professores para receber notificações.'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCommunitySettingsOpen(true)}
                className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center transition-all hover:bg-white/5"
                style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}
                aria-label="Configurações da Comunidade"
              >
                <Settings size={17} className="text-neutral-400" />
              </button>
            </div>

            {/* ── Tab Bar ── */}
            <div className="mt-4 flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
              {[
                { key: 'feed' as CommunityTab, label: 'Feed', icon: <Rss size={13} /> },
                { key: 'follow' as CommunityTab, label: 'Seguir', icon: <UserPlus size={13} /> },
                { key: 'ranking' as CommunityTab, label: 'Ranking', icon: <Trophy size={13} /> },
              ].map((tab) => {
                const isActive = activeTab === tab.key
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-200 ${
                      isActive ? 'text-black' : 'text-neutral-500 hover:text-neutral-300'
                    }`}
                    style={isActive ? {
                      background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 60%, #b45309 100%)',
                      boxShadow: '0 2px 12px rgba(234,179,8,0.3)',
                    } : {}}
                  >
                    {tab.icon}
                    {tab.label}
                    {tab.key === 'follow' && followRequests.length > 0 && (
                      <span
                        className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black"
                        style={isActive ? { background: 'rgba(0,0,0,0.3)', color: '#fff' } : { background: 'rgba(234,179,8,0.8)', color: '#000' }}
                      >
                        {followRequests.length}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Search bar — only on follow tab */}
            {activeTab === 'follow' && (
              <div
                className="mt-3 flex items-center gap-2.5 px-4 py-3 rounded-xl transition-all"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <Search size={15} className="text-neutral-500 flex-shrink-0" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="bg-transparent outline-none text-sm text-white flex-1 placeholder-neutral-600"
                  placeholder="Buscar por nome ou tipo (teacher/student)…"
                />
                {query && (
                  <button type="button" onClick={() => setQuery('')} className="text-neutral-600 hover:text-neutral-400 transition-colors">
                    <X size={14} />
                  </button>
                )}
              </div>
            )}
          </div>
        </GoldGradientBorder>

        {/* ── Settings Modal ── */}
        {communitySettingsOpen && (
          <div className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center p-4 pt-safe" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}>
            <div
              className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
              style={{ background: 'rgba(12,12,12,0.98)', border: '1px solid rgba(234,179,8,0.2)', boxShadow: '0 0 60px rgba(234,179,8,0.08), 0 30px 80px rgba(0,0,0,0.6)' }}
            >
              {/* Modal Header */}
              <div className="px-5 pt-5 pb-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-yellow-500 mb-0.5">Comunidade</div>
                  <div className="text-white font-black text-lg flex items-center gap-2">
                    <Bell size={18} className="text-yellow-500" />
                    Configurações
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCommunitySettingsOpen(false)}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                  aria-label="Fechar"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Settings body */}
              <div className="px-5 py-3 max-h-[60vh] overflow-y-auto">
                <ToggleButton settingKey="allowSocialFollows" label="Permitir convites para seguir" description="Se desligar, ninguém consegue solicitar para te seguir." />
                <ToggleButton settingKey="notifySocialFollows" label="Notificações sociais" description="Solicitações de seguir e confirmações." />
                <ToggleButton settingKey="notifyFriendOnline" label="Amigo entrou no app" description="Avisos de presença." />
                <ToggleButton settingKey="notifyFriendWorkoutEvents" label="Atividades de treino do amigo" description="Início/fim/criação/edição de treino." />
                <ToggleButton settingKey="notifyFriendPRs" label="PRs do amigo" description="Avisos quando bater recorde pessoal." />
                <ToggleButton settingKey="notifyFriendStreaks" label="Streak do amigo" description="Avisos de sequência de dias treinando." />
                <ToggleButton settingKey="notifyFriendGoals" label="Metas do amigo" description="Avisos de marcos (ex.: 10, 50 treinos)." />
                <ToggleButton settingKey="inAppToasts" label="Card flutuante (toasts)" description="Mensagens rápidas no topo da tela." />
              </div>

              {/* Modal Footer */}
              <div className="px-5 py-4 flex gap-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <button
                  type="button"
                  onClick={() => setCommunitySettingsOpen(false)}
                  className="flex-1 py-3 rounded-xl font-bold text-sm text-neutral-300 transition-all hover:bg-white/5"
                  style={{ border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  Fechar
                </button>
                <button
                  type="button"
                  disabled={userSettingsApi?.saving}
                  onClick={async () => {
                    try {
                      const res = await userSettingsApi.save()
                      if (!res?.ok) { if (typeof window !== 'undefined') window.alert(String(res?.error || 'Falha ao salvar')); return }
                      setCommunitySettingsOpen(false)
                    } catch (e) { if (typeof window !== 'undefined') window.alert(e instanceof Error ? e.message : String(e)) }
                  }}
                  className="flex-1 py-3 rounded-xl font-black text-sm text-black transition-all disabled:opacity-50 active:scale-[0.98]"
                  style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 60%, #b45309 100%)', boxShadow: '0 4px 16px rgba(234,179,8,0.3)' }}
                >
                  {userSettingsApi?.saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Loading ── */}
        {loading ? (
          <GoldGradientBorder>
            <div className="p-8 flex flex-col items-center gap-3">
              <Loader2 size={28} className="text-yellow-500 animate-spin" />
              <div className="text-sm text-neutral-500">Carregando comunidade…</div>
            </div>
          </GoldGradientBorder>
        ) : !userId ? (
          <GoldGradientBorder>
            <div className="p-6 text-center">
              <Users size={32} className="text-neutral-600 mx-auto mb-3" />
              <div className="text-sm text-neutral-400">Faça login para usar a comunidade.</div>
            </div>
          </GoldGradientBorder>
        ) : (
          <>
            {/* ── FEED TAB ── */}
            {activeTab === 'feed' && (
              <>
                {/* Treinando Agora */}
                {onlineFriends.length > 0 && (
                  <GoldGradientBorder>
                    <div className="px-4 py-3 flex items-center gap-3">
                      <div className="relative flex-shrink-0">
                        <Radio size={16} className="text-green-400" />
                        <span
                          className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                          style={{ background: '#22c55e', boxShadow: '0 0 6px #22c55e', animation: 'pulse 2s infinite' }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-black uppercase tracking-widest text-green-400">Treinando Agora</div>
                        <div className="text-[11px] text-neutral-400 truncate">
                          {onlineFriendProfiles.slice(0, 3).map((p) => safeString(p.display_name).split(' ')[0]).join(', ')}
                          {onlineFriends.length > 3 && ` +${onlineFriends.length - 3}`}
                        </div>
                      </div>
                      <div className="flex -space-x-2">
                        {onlineFriendProfiles.slice(0, 4).map((p) => (
                          <Avatar key={p.id} photo={p.photo_url} name={safeString(p.display_name)} size={28} />
                        ))}
                      </div>
                    </div>
                  </GoldGradientBorder>
                )}

                {/* Feed items */}
                {feedLoading && feedItems.length === 0 ? (
                  <GoldGradientBorder>
                    <div className="p-8 flex flex-col items-center gap-3">
                      <Loader2 size={28} className="text-yellow-500 animate-spin" />
                      <div className="text-sm text-neutral-500">Carregando feed…</div>
                    </div>
                  </GoldGradientBorder>
                ) : feedItems.length === 0 ? (
                  <GoldGradientBorder>
                    <div className="p-8 flex flex-col items-center gap-3 text-center">
                      <Rss size={28} className="text-neutral-600" />
                      <div className="text-sm text-neutral-500">
                        Nenhuma atividade ainda.
                      </div>
                      <div className="text-xs text-neutral-600">
                        Siga amigos na aba &quot;Seguir&quot; para ver as atividades deles aqui.
                      </div>
                    </div>
                  </GoldGradientBorder>
                ) : (
                  <GoldGradientBorder>
                    <div>
                      {feedItems.map((item) => (
                        <FeedCard key={item.id} item={item} onProfileClick={(id) => setProfileModalUserId(id)} />
                      ))}
                      {feedHasMore && (
                        <button
                          type="button"
                          onClick={() => loadFeed()}
                          disabled={feedLoading}
                          className="w-full py-3 text-xs font-black text-yellow-500 hover:text-yellow-400 transition-colors disabled:opacity-50"
                        >
                          {feedLoading ? 'Carregando…' : 'Carregar mais'}
                        </button>
                      )}
                    </div>
                  </GoldGradientBorder>
                )}
              </>
            )}

            {/* ── FOLLOW TAB ── */}
            {activeTab === 'follow' && (
              <>
                {/* Pedidos para Seguir */}
                <GoldGradientBorder>
                  <div>
                    <div className="px-4 py-3.5 flex items-center justify-between" style={{ borderBottom: followRequests.length ? '1px solid rgba(255,255,255,0.05)' : undefined }}>
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: followRequests.length ? 'rgba(234,179,8,0.12)' : 'rgba(255,255,255,0.04)', border: followRequests.length ? '1px solid rgba(234,179,8,0.2)' : '1px solid rgba(255,255,255,0.06)' }}
                        >
                          <UserPlus size={15} className={followRequests.length ? 'text-yellow-500' : 'text-neutral-500'} />
                        </div>
                        <div>
                          <div className="text-xs font-black uppercase tracking-widest" style={{ color: followRequests.length ? '#f59e0b' : 'rgba(255,255,255,0.4)' }}>
                            Pedidos para Seguir
                          </div>
                          <div className="text-[11px] text-neutral-500">
                            {followRequests.length ? `${followRequests.length} pendente(s)` : 'Nenhuma solicitação pendente.'}
                          </div>
                        </div>
                      </div>
                      {followRequests.length > 0 && (
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-black"
                          style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
                        >
                          {followRequests.length}
                        </div>
                      )}
                    </div>
                    {loadError && <div className="px-4 py-2 text-xs text-red-400">{loadError}</div>}
                    {followRequests.length > 0 && (
                      <div>
                        {followRequests.map((r, i) => {
                          const p = r.follower_profile
                          const name = safeString(p?.display_name).trim() || 'Usuário'
                          const role = formatRoleLabel(p?.role)
                          const roleColor = getRoleColor(p?.role)
                          const photo = safeString(p?.photo_url).trim()
                          const busy = busyRequestId === r.follower_id
                          return (
                            <div key={r.follower_id} className={`px-4 py-3.5 flex items-center gap-3 ${i < followRequests.length - 1 ? 'border-b border-white/5' : ''}`}>
                              <Avatar photo={photo} name={name} size={42} />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-black text-white truncate">{name}</div>
                                <div className={`text-[11px] font-bold uppercase tracking-wider truncate ${roleColor}`}>{role}</div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {busy ? (
                                  <Loader2 size={18} className="text-yellow-500 animate-spin" />
                                ) : (
                                  <>
                                    <GoldButton onClick={() => respondFollowRequest(r.follower_id, 'accept')} variant="gold">
                                      <Check size={13} /> Aceitar
                                    </GoldButton>
                                    <GoldButton onClick={() => respondFollowRequest(r.follower_id, 'deny')} variant="ghost">
                                      <X size={13} />
                                    </GoldButton>
                                  </>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </GoldGradientBorder>

                {/* Lista de Usuários */}
                {filtered.length === 0 ? (
                  <GoldGradientBorder>
                    <div className="p-8 flex flex-col items-center gap-3 text-center">
                      <Search size={28} className="text-neutral-600" />
                      <div className="text-sm text-neutral-500">Nenhum usuário encontrado.</div>
                    </div>
                  </GoldGradientBorder>
                ) : (
                  <GoldGradientBorder>
                    <div>
                      <div
                        className="px-4 py-2.5 flex items-center gap-2"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.01)' }}
                      >
                        <Bell size={12} className="text-neutral-600 flex-shrink-0" />
                        <span className="text-[11px] text-neutral-600">Notificações aparecem somente após o usuário aceitar seu pedido.</span>
                      </div>
                      <div>
                        {filtered.map((p, i) => {
                          const followRow = follows.get(p.id) || null
                          const status = followRow?.status || null
                          const busy = busyId === p.id
                          const name = safeString(p.display_name).trim() || 'Usuário'
                          const role = formatRoleLabel(p.role)
                          const roleColor = getRoleColor(p.role)
                          const photo = safeString(p.photo_url).trim()
                          return (
                            <div
                              key={p.id}
                              className={`px-4 py-3.5 flex items-center gap-3 transition-colors hover:bg-white/[0.02] ${i < filtered.length - 1 ? 'border-b border-white/[0.04]' : ''}`}
                            >
                              <div className="relative flex-shrink-0">
                                <Avatar photo={photo} name={name} size={44} />
                                {status === 'accepted' && (
                                  <div
                                    className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                                    style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', border: '1.5px solid #0a0a0a' }}
                                  >
                                    <Check size={9} strokeWidth={3} className="text-white" />
                                  </div>
                                )}
                                {status === 'pending' && (
                                  <div
                                    className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                                    style={{ background: 'rgba(234,179,8,0.9)', border: '1.5px solid #0a0a0a' }}
                                  >
                                    <Clock size={9} strokeWidth={3} className="text-black" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-black text-white truncate">{name}</div>
                                <div className={`text-[11px] font-bold uppercase tracking-wider truncate ${roleColor}`}>{role}</div>
                              </div>
                              <div className="flex-shrink-0">
                                {busy ? (
                                  <Loader2 size={18} className="text-yellow-500 animate-spin" />
                                ) : status === 'accepted' ? (
                                  <GoldButton onClick={() => unfollow(p.id)} variant="danger">
                                    <UserMinus size={13} /> Seguindo
                                  </GoldButton>
                                ) : status === 'pending' ? (
                                  <div className="flex flex-col items-end gap-1">
                                    <div className="text-[10px] uppercase tracking-widest font-black text-yellow-600/70 flex items-center gap-1">
                                      <Clock size={9} /> Aguardando
                                    </div>
                                    <GoldButton onClick={() => cancelFollowRequest(p.id)} variant="ghost" className="text-[11px]">
                                      Cancelar
                                    </GoldButton>
                                  </div>
                                ) : (
                                  <GoldButton onClick={() => follow(p.id)} variant="gold">
                                    <UserPlus size={13} /> Seguir
                                  </GoldButton>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </GoldGradientBorder>
                )}
              </>
            )}

            {/* ── RANKING TAB ── */}
            {activeTab === 'ranking' && (
              <GoldGradientBorder>
                <LeaderboardPanel userId={userId} />
              </GoldGradientBorder>
            )}

            {/* ── User Profile Modal ── */}
            {profileModalUserId && (
              <UserProfileModal
                userId={profileModalUserId}
                onClose={() => setProfileModalUserId(null)}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
