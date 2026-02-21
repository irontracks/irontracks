'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { useUserSettings } from '@/hooks/useUserSettings'
import { InAppNotificationsProvider, useInAppNotifications } from '@/contexts/InAppNotificationsContext'
import { ArrowLeft, Search, Settings, UserPlus, UserMinus } from 'lucide-react'
import type { RealtimeChannel } from '@supabase/supabase-js'

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
  const showMessage = useCallback(
    (text: string) => {
      const msg = String(text || '').trim()
      if (!msg) return
      const allowToasts = Boolean(userSettingsApi?.settings?.inAppToasts ?? true)
      if (allowToasts) {
        notify({
          text: msg,
          senderName: 'Comunidade',
          displayName: 'Comunidade',
          photoURL: undefined,
          type: 'info',
        })
        return
      }
      try {
        if (typeof window !== 'undefined') window.alert(msg)
      } catch {}
    },
    [notify, userSettingsApi?.settings?.inAppToasts]
  )

  const communityEnabled = Boolean(userSettingsApi?.settings?.moduleCommunity ?? true)

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

    return () => {
      mounted = false
    }
  }, [supabase])

  const loadFollowerProfiles = useCallback(
    async (ids: string[]) => {
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
          const prof: ProfileRow = {
            id,
            display_name: row?.display_name ? String(row.display_name) : null,
            photo_url: row?.photo_url ? String(row.photo_url) : null,
            role: row?.role ? String(row.role) : null,
          }
          followerProfileCacheRef.current.set(id, prof)
          out.set(id, prof)
        })

        missing.forEach((id) => {
          if (got.has(id)) return
          followerProfileCacheRef.current.set(id, null)
          out.set(id, null)
        })
      } catch {
        missing.forEach((id) => {
          followerProfileCacheRef.current.set(id, null)
          out.set(id, null)
        })
      }

      return out
    },
    [supabase]
  )

  const loadAll = useCallback(
    async (uid: string) => {
      const id = String(uid || '').trim()
      if (!id) return

      const [profilesRes, followsRes, incomingRes] = await Promise.all([
        supabase.from('profiles').select('id, display_name, photo_url, role').order('display_name', { ascending: true }).limit(500),
        supabase.from('social_follows').select('follower_id, following_id, status').eq('follower_id', id).limit(5000),
        supabase
          .from('social_follows')
          .select('follower_id, following_id, status')
          .eq('following_id', id)
          .eq('status', 'pending')
          .limit(5000),
      ])

      const profilesErr = profilesRes?.error ? String(profilesRes.error.message || profilesRes.error) : ''
      const followsErr = followsRes?.error ? String(followsRes.error.message || followsRes.error) : ''
      const incomingErr = incomingRes?.error ? String(incomingRes.error.message || incomingRes.error) : ''
      if (profilesErr || followsErr || incomingErr) {
        const raw = profilesErr || followsErr || incomingErr
        const lower = raw.toLowerCase()
        const msg = (() => {
          if (lower.includes('schema cache') || lower.includes('could not find the table') || lower.includes('social_follows')) {
            return 'O Social System não está aplicado no Supabase (tabela social_follows ausente). Rode as migrations do Supabase e recarregue a página.'
          }
          return raw || 'Falha ao carregar dados da comunidade.'
        })()
        setLoadError(msg)
      } else {
        setLoadError('')
      }

      const list = (Array.isArray(profilesRes?.data) ? profilesRes.data : [])
        .filter((row) => row && typeof row === 'object')
        .map((row: Record<string, unknown>) => ({
          id: String(row.id),
          display_name: row.display_name ? String(row.display_name) : null,
          photo_url: row.photo_url ? String(row.photo_url) : null,
          role: row.role ? String(row.role) : null,
        }))
        .filter((row) => row.id && row.id !== id)

      setProfiles(list)

      const map = new Map<string, FollowRow>()
      ;(Array.isArray(followsRes?.data) ? followsRes.data : []).forEach((row: Record<string, unknown>) => {
        const fid = String(row?.following_id || '').trim()
        if (!fid) return
        map.set(fid, {
          follower_id: String(row?.follower_id || '').trim(),
          following_id: fid,
          status: row?.status === 'accepted' ? 'accepted' : 'pending',
        })
      })
      setFollows(map)

      let incomingRows = (Array.isArray(incomingRes?.data) ? incomingRes.data : [])
        .filter((r) => r && typeof r === 'object')
        .map((r: Record<string, unknown>) => ({
          follower_id: String(r?.follower_id || '').trim(),
          following_id: String(r?.following_id || '').trim(),
          status: 'pending' as const,
        }))
        .filter((r) => r.follower_id && r.following_id)

      if ((!incomingRows.length && incomingErr) || (incomingErr && incomingRows.length === 0)) {
        try {
          const { data: notifRows } = await supabase
            .from('notifications')
            .select('sender_id, metadata, read, created_at')
            .eq('user_id', id)
            .eq('type', 'follow_request')
            .eq('read', false)
            .order('created_at', { ascending: false })
            .limit(100)

          const followerIds = (Array.isArray(notifRows) ? notifRows : [])
            .map((n: Record<string, unknown>) => {
              const meta = n?.metadata && typeof n.metadata === 'object' ? (n.metadata as Record<string, unknown>) : null
              return String(n?.sender_id ?? meta?.follower_id ?? '').trim()
            })
            .filter(Boolean)

          incomingRows = Array.from(new Set(followerIds)).map((fid) => ({
            follower_id: fid,
            following_id: id,
            status: 'pending' as const,
          }))
        } catch {}
      }

      const followerIds = incomingRows.map((r) => r.follower_id)
      const profilesById = await loadFollowerProfiles(followerIds)

      setFollowRequests(
        incomingRows.map((r) => ({
          ...r,
          follower_profile: profilesById.get(r.follower_id) ?? null,
        }))
      )
    },
    [loadFollowerProfiles, supabase]
  )

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      setProfiles([])
      setFollows(new Map())
      setFollowRequests([])
      return
    }

    let mounted = true
    let incomingChannel: RealtimeChannel | null = null
    let outgoingChannel: RealtimeChannel | null = null

    const run = async () => {
      setLoading(true)
      try {
        await loadAll(userId)
      } catch {
        if (!mounted) return
        setProfiles([])
        setFollows(new Map())
        setFollowRequests([])
      } finally {
        if (mounted) setLoading(false)
      }
    }

    run()

    try {
      incomingChannel = supabase
        .channel(`community:follows:incoming:${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'social_follows', filter: `following_id=eq.${userId}` },
          async (payload) => {
            try {
              if (!mounted) return
              const ev = String(payload?.eventType || '').toUpperCase()
              const row = (ev === 'DELETE' ? payload?.old : payload?.new) as Record<string, unknown>
              const followerId = String(row?.follower_id || '').trim()
              const status = String(row?.status || '').trim().toLowerCase()
              if (!followerId) return

              if (ev === 'DELETE' || status !== 'pending') {
                setFollowRequests((prev) => prev.filter((r) => r.follower_id !== followerId))
                return
              }

              const byId = await loadFollowerProfiles([followerId])
              const prof = byId.get(followerId) ?? null

              setFollowRequests((prev) => {
                const current = Array.isArray(prev) ? prev : []
                const exists = current.some((r) => r?.follower_id === followerId)
                if (exists) {
                  return current.map((r) => (r?.follower_id === followerId ? { ...r, follower_profile: prof } : r))
                }
                return [{ follower_id: followerId, following_id: userId, status: 'pending', follower_profile: prof }, ...current]
              })
            } catch {}
          }
        )
        .subscribe()
    } catch {}

    try {
      outgoingChannel = supabase
        .channel(`community:follows:outgoing:${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'social_follows', filter: `follower_id=eq.${userId}` },
          (payload) => {
            try {
              if (!mounted) return
              const ev = String(payload?.eventType || '').toUpperCase()
              const row = (ev === 'DELETE' ? payload?.old : payload?.new) as Record<string, unknown>
              const followingId = String(row?.following_id || '').trim()
              const status = String(row?.status || '').trim().toLowerCase()
              if (!followingId) return

              setFollows((prev) => {
                const next = new Map(prev)
                if (ev === 'DELETE') {
                  next.delete(followingId)
                  return next
                }
                next.set(followingId, {
                  follower_id: userId,
                  following_id: followingId,
                  status: status === 'accepted' ? 'accepted' : 'pending',
                })
                return next
              })
            } catch {}
          }
        )
        .subscribe()
    } catch {}

    const refresh = () => {
      try {
        if (!mounted) return
        run()
      } catch {}
    }

    const handleVisibilityChange = () => {
      try {
        if (document.visibilityState === 'visible') refresh()
      } catch {}
    }

    try {
      document.addEventListener('visibilitychange', handleVisibilityChange)
      window.addEventListener('pageshow', refresh)
    } catch {}

    return () => {
      mounted = false
      try {
        if (incomingChannel) supabase.removeChannel(incomingChannel)
      } catch {}
      try {
        if (outgoingChannel) supabase.removeChannel(outgoingChannel)
      } catch {}
      try {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      } catch {}
      try {
        window.removeEventListener('pageshow', refresh)
      } catch {}
    }
  }, [loadAll, loadFollowerProfiles, supabase, userId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = Array.isArray(profiles) ? profiles : []
    if (!q) return base
    return base.filter((p) => {
      const name = safeString(p.display_name).toLowerCase()
      const role = safeString(p.role).toLowerCase()
      return name.includes(q) || role.includes(q)
    })
  }, [profiles, query])

  const respondFollowRequest = async (followerId: string, decision: 'accept' | 'deny') => {
    const fid = String(followerId || '').trim()
    if (!fid || !userId) return
    if (busyRequestId) return
    setBusyRequestId(fid)
    try {
      const res = await fetch('/api/social/follow/respond', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ follower_id: fid, decision }),
      })
      const data = await res.json().catch((): null => null)
      if (!data?.ok) {
        const raw = String(data?.error || 'Falha ao responder')
        const msg = (() => {
          const lower = raw.toLowerCase()
          if (lower.includes('schema cache') || lower.includes('could not find the table') || lower.includes('social_follows')) {
            return 'O Social System não está aplicado no Supabase (tabela social_follows ausente). Rode as migrations do Supabase e recarregue a página.'
          }
          if (lower.includes('replica identity') || (lower.includes('publishes') && lower.includes('updates'))) {
            return 'Falha ao atualizar a solicitação. O banco precisa de Primary Key/Replica Identity em social_follows. Rode as migrations do Supabase e recarregue a página.'
          }
          return raw
        })()
        if (typeof window !== 'undefined') window.alert(msg)
        return
      }

      setFollowRequests((prev) => prev.filter((r) => r.follower_id !== fid))
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (typeof window !== 'undefined') window.alert(message)
    } finally {
      setBusyRequestId('')
    }
  }

  const cancelFollowRequest = async (profileId: string) => {
    const pid = String(profileId || '').trim()
    if (!pid || !userId) return
    if (busyId) return
    setBusyId(pid)
    try {
      const res = await fetch('/api/social/follow/cancel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ following_id: pid }),
      })
      const data = await res.json().catch((): null => null)
      if (!data?.ok) {
        const raw = String(data?.error || 'Falha ao cancelar')
        const msg = (() => {
          const lower = raw.toLowerCase()
          if (lower.includes('schema cache') || lower.includes('could not find the table') || lower.includes('social_follows')) {
            return 'O Social System não está aplicado no Supabase (tabela social_follows ausente). Rode as migrations do Supabase e recarregue a página.'
          }
          return raw
        })()
        if (typeof window !== 'undefined') window.alert(msg)
        return
      }

      const status = String(data?.status || '').trim().toLowerCase()
      const already = data?.already === true

      if (!already || status !== 'accepted') {
        setFollows((prev) => {
          const next = new Map(prev)
          next.delete(pid)
          return next
        })
      }

      try {
        await loadAll(userId)
      } catch {}
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (typeof window !== 'undefined') window.alert(message)
    } finally {
      setBusyId('')
    }
  }

  const follow = async (profileId: string) => {
    const pid = String(profileId || '').trim()
    if (!pid || !userId) return
    if (busyId) return
    setBusyId(pid)
    try {
      const res = await fetch('/api/social/follow', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ following_id: pid }),
      })
      const data = await res.json().catch((): null => null)
      if (!data?.ok) {
        const raw = String(data?.error || 'Falha ao seguir')
        const msg = (() => {
          const lower = raw.toLowerCase()
          if (lower.includes('user_not_accepting_follows')) {
            return 'Este usuário não está aceitando convites para seguir.'
          }
          if (lower.includes('schema cache') || lower.includes('could not find the table') || lower.includes('social_follows')) {
            return 'O Social System não está aplicado no Supabase (tabela social_follows ausente). Rode as migrations do Supabase e recarregue a página.'
          }
          return raw
        })()
        showMessage(msg)
        return
      }
      try {
        if (data?.notified === false && typeof window !== 'undefined') {
          showMessage('Convite enviado. O usuário pode ter desativado notificações sociais e aprovará pela Comunidade.')
        }
      } catch {}
      setFollows((prev) => {
        const next = new Map(prev)
        next.set(pid, { follower_id: userId, following_id: pid, status: 'pending' })
        return next
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      showMessage(message)
    } finally {
      setBusyId('')
    }
  }

  const unfollow = async (profileId: string) => {
    const pid = String(profileId || '').trim()
    if (!pid || !userId) return
    if (busyId) return
    setBusyId(pid)
    try {
      const { error } = await supabase
        .from('social_follows')
        .delete()
        .eq('follower_id', userId)
        .eq('following_id', pid)
      if (error) throw error

      try {
        await supabase.from('notifications').delete().eq('user_id', userId).eq('sender_id', pid)
      } catch {}

      setFollows((prev) => {
        const next = new Map(prev)
        next.delete(pid)
        return next
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (typeof window !== 'undefined') window.alert(message)
    } finally {
      setBusyId('')
    }
  }

  if (userId && userSettingsApi?.loaded && !communityEnabled) {
    return (
      <div className={embedded ? '' : 'min-h-screen bg-neutral-950 text-white p-4 pt-safe'}>
        <div className={embedded ? 'space-y-4' : 'max-w-3xl mx-auto space-y-4'}>
          {!embedded ? (
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black hover:bg-neutral-800 active:scale-95 transition-all"
            >
              Voltar ao Dashboard
            </button>
          ) : null}
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4">
            <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Comunidade</div>
            <div className="text-lg font-black text-white mt-1">Módulo desativado</div>
            <div className="text-sm text-neutral-400 mt-2">Ative em Configurações → Módulos opcionais.</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={embedded ? '' : "min-h-screen bg-neutral-900 text-white p-4 pt-safe"}>
      <div className={embedded ? "space-y-4" : "max-w-4xl mx-auto space-y-4"}>
        <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {!embedded && (
                <button
                  type="button"
                  onClick={() => {
                    try {
                      if (typeof window !== 'undefined' && window.history.length > 1) router.back()
                      else router.push('/dashboard')
                    } catch {
                      router.push('/dashboard')
                    }
                  }}
                  className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 transition-colors inline-flex items-center justify-center text-neutral-200"
                  aria-label="Voltar"
                  title="Voltar"
                >
                  <ArrowLeft size={18} />
                </button>
              )}
              <div className="min-w-0">
              <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Comunidade</div>
              <div className="text-white font-black text-xl truncate">Seguir Amigos</div>
              <div className="text-xs text-neutral-400">Siga alunos e professores para receber notificações.</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCommunitySettingsOpen(true)}
              className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 transition-colors inline-flex items-center justify-center text-neutral-200"
              aria-label="Configurações da Comunidade"
              title="Configurações da Comunidade"
            >
              <Settings size={18} />
            </button>
          </div>
          <div className="mt-4 flex items-center gap-2 bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2">
            <Search size={16} className="text-neutral-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="bg-transparent outline-none text-sm text-white flex-1"
              placeholder="Buscar por nome ou tipo (teacher/student)…"
            />
          </div>
        </div>

        {communitySettingsOpen && (
          <div className="fixed inset-0 z-[1200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe">
            <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden">
              <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Comunidade</div>
                  <div className="text-white font-black text-lg truncate">Configurações</div>
                </div>
                <button
                  type="button"
                  onClick={() => setCommunitySettingsOpen(false)}
                  className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center"
                  aria-label="Fechar"
                >
                  <ArrowLeft size={18} />
                </button>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-white">Permitir convites para seguir</div>
                    <div className="text-xs text-neutral-400">Se desligar, ninguém consegue solicitar para te seguir.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => userSettingsApi.updateSetting('allowSocialFollows', !(userSettingsApi?.settings?.allowSocialFollows ?? true))}
                    className={
                      (userSettingsApi?.settings?.allowSocialFollows ?? true)
                        ? 'px-3 py-2 rounded-xl bg-yellow-500 text-black font-black'
                        : 'px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-black'
                    }
                  >
                    {(userSettingsApi?.settings?.allowSocialFollows ?? true) ? 'Ativo' : 'Bloqueado'}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-white">Notificações sociais</div>
                    <div className="text-xs text-neutral-400">Solicitações de seguir e confirmações.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => userSettingsApi.updateSetting('notifySocialFollows', !(userSettingsApi?.settings?.notifySocialFollows ?? true))}
                    className={
                      (userSettingsApi?.settings?.notifySocialFollows ?? true)
                        ? 'px-3 py-2 rounded-xl bg-yellow-500 text-black font-black'
                        : 'px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-black'
                    }
                  >
                    {(userSettingsApi?.settings?.notifySocialFollows ?? true) ? 'Ativo' : 'Desligado'}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-white">Amigo entrou no app</div>
                    <div className="text-xs text-neutral-400">Avisos de presença.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => userSettingsApi.updateSetting('notifyFriendOnline', !(userSettingsApi?.settings?.notifyFriendOnline ?? true))}
                    className={
                      (userSettingsApi?.settings?.notifyFriendOnline ?? true)
                        ? 'px-3 py-2 rounded-xl bg-yellow-500 text-black font-black'
                        : 'px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-black'
                    }
                  >
                    {(userSettingsApi?.settings?.notifyFriendOnline ?? true) ? 'Ativo' : 'Desligado'}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-white">Atividades de treino do amigo</div>
                    <div className="text-xs text-neutral-400">Início/fim/criação/edição de treino.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => userSettingsApi.updateSetting('notifyFriendWorkoutEvents', !(userSettingsApi?.settings?.notifyFriendWorkoutEvents ?? true))}
                    className={
                      (userSettingsApi?.settings?.notifyFriendWorkoutEvents ?? true)
                        ? 'px-3 py-2 rounded-xl bg-yellow-500 text-black font-black'
                        : 'px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-black'
                    }
                  >
                    {(userSettingsApi?.settings?.notifyFriendWorkoutEvents ?? true) ? 'Ativo' : 'Desligado'}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-white">PRs do amigo</div>
                    <div className="text-xs text-neutral-400">Avisos quando bater recorde pessoal.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => userSettingsApi.updateSetting('notifyFriendPRs', !(userSettingsApi?.settings?.notifyFriendPRs ?? true))}
                    className={
                      (userSettingsApi?.settings?.notifyFriendPRs ?? true)
                        ? 'px-3 py-2 rounded-xl bg-yellow-500 text-black font-black'
                        : 'px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-black'
                    }
                  >
                    {(userSettingsApi?.settings?.notifyFriendPRs ?? true) ? 'Ativo' : 'Desligado'}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-white">Streak do amigo</div>
                    <div className="text-xs text-neutral-400">Avisos de sequência de dias treinando.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => userSettingsApi.updateSetting('notifyFriendStreaks', !(userSettingsApi?.settings?.notifyFriendStreaks ?? true))}
                    className={
                      (userSettingsApi?.settings?.notifyFriendStreaks ?? true)
                        ? 'px-3 py-2 rounded-xl bg-yellow-500 text-black font-black'
                        : 'px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-black'
                    }
                  >
                    {(userSettingsApi?.settings?.notifyFriendStreaks ?? true) ? 'Ativo' : 'Desligado'}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-white">Metas do amigo</div>
                    <div className="text-xs text-neutral-400">Avisos de marcos (ex.: 10, 50 treinos).</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => userSettingsApi.updateSetting('notifyFriendGoals', !(userSettingsApi?.settings?.notifyFriendGoals ?? true))}
                    className={
                      (userSettingsApi?.settings?.notifyFriendGoals ?? true)
                        ? 'px-3 py-2 rounded-xl bg-yellow-500 text-black font-black'
                        : 'px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-black'
                    }
                  >
                    {(userSettingsApi?.settings?.notifyFriendGoals ?? true) ? 'Ativo' : 'Desligado'}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-white">Card flutuante (toasts)</div>
                    <div className="text-xs text-neutral-400">Mensagens rápidas no topo da tela.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => userSettingsApi.updateSetting('inAppToasts', !(userSettingsApi?.settings?.inAppToasts ?? true))}
                    className={
                      (userSettingsApi?.settings?.inAppToasts ?? true)
                        ? 'px-3 py-2 rounded-xl bg-yellow-500 text-black font-black'
                        : 'px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-black'
                    }
                  >
                    {(userSettingsApi?.settings?.inAppToasts ?? true) ? 'Ativo' : 'Desligado'}
                  </button>
                </div>
              </div>
              <div className="p-4 border-t border-neutral-800 flex gap-2">
                <button
                  type="button"
                  onClick={() => setCommunitySettingsOpen(false)}
                  className="flex-1 p-3 bg-neutral-800 rounded-xl font-bold text-neutral-200"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  disabled={userSettingsApi?.saving}
                  onClick={async () => {
                    try {
                      const res = await userSettingsApi.save()
                      if (!res?.ok) {
                        if (typeof window !== 'undefined') window.alert(String(res?.error || 'Falha ao salvar'))
                        return
                      }
                      setCommunitySettingsOpen(false)
                    } catch (e) {
                      const message = e instanceof Error ? e.message : String(e)
                      if (typeof window !== 'undefined') window.alert(message)
                    }
                  }}
                  className="flex-1 p-3 bg-yellow-500 rounded-xl font-black text-black disabled:opacity-50"
                >
                  {userSettingsApi?.saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 text-sm text-neutral-400">Carregando…</div>
        ) : !userId ? (
          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 text-sm text-neutral-400">
            Faça login para usar a comunidade.
          </div>
        ) : (
          <>
            <div className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-neutral-700 flex items-center justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Pedidos para seguir</div>
                  <div className="text-sm text-neutral-300">
                    {followRequests.length ? `${followRequests.length} pendente(s)` : 'Nenhuma solicitação pendente.'}
                  </div>
                  {loadError ? <div className="text-xs text-red-400 mt-1">{loadError}</div> : null}
                </div>
              </div>
              {followRequests.length ? (
                <div className="divide-y divide-neutral-700">
                  {followRequests.map((r) => {
                    const p = r.follower_profile
                    const name = safeString(p?.display_name).trim() || 'Usuário'
                    const role = formatRoleLabel(p?.role)
                    const photo = safeString(p?.photo_url).trim()
                    const busy = busyRequestId === r.follower_id
                    return (
                      <div key={r.follower_id} className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-neutral-900 border border-neutral-700 overflow-hidden flex items-center justify-center">
                          {photo ? (
                            <Image src={photo} alt="" width={40} height={40} className="w-full h-full object-cover" unoptimized />
                          ) : (
                            <div className="text-xs font-black text-neutral-400">{name[0]}</div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-black text-white truncate">{name}</div>
                          <div className="text-[11px] text-neutral-400 uppercase tracking-wide truncate">{role}</div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => respondFollowRequest(r.follower_id, 'accept')}
                            className={
                              busy
                                ? 'px-3 py-2 rounded-xl bg-yellow-500/40 text-black/50 font-black cursor-not-allowed'
                                : 'px-3 py-2 rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400 transition-colors'
                            }
                          >
                            Aceitar
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => respondFollowRequest(r.follower_id, 'deny')}
                            className={
                              busy
                                ? 'px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-500 font-black cursor-not-allowed'
                                : 'px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black hover:bg-neutral-800 transition-colors'
                            }
                          >
                            Negar
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>
            {filtered.length === 0 ? (
              <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 text-sm text-neutral-400">
                Nenhum usuário encontrado.
              </div>
            ) : (
              <div className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-neutral-700 text-xs text-neutral-400">
                  Notificações aparecem somente após o usuário aceitar seu pedido.
                </div>
                <div className="divide-y divide-neutral-700">
                  {filtered.map((p) => {
                    const followRow = follows.get(p.id) || null
                    const status = followRow?.status || null
                    const busy = busyId === p.id
                    const name = safeString(p.display_name).trim() || 'Usuário'
                    const role = formatRoleLabel(p.role)
                    const photo = safeString(p.photo_url).trim()

                    return (
                      <div key={p.id} className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-neutral-900 border border-neutral-700 overflow-hidden flex items-center justify-center">
                          {photo ? (
                            <Image src={photo} alt="" width={40} height={40} className="w-full h-full object-cover" unoptimized />
                          ) : (
                            <div className="text-xs font-black text-neutral-400">{name[0]}</div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-black text-white truncate">{name}</div>
                          <div className="text-[11px] text-neutral-400 uppercase tracking-wide truncate">{role}</div>
                        </div>

                        {status === 'accepted' ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => unfollow(p.id)}
                            className={
                              busy
                                ? 'px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-500 font-black cursor-not-allowed'
                                : 'px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black hover:border-red-500 hover:text-red-400 transition-colors inline-flex items-center gap-2'
                            }
                          >
                            <UserMinus size={16} /> Parar de seguir
                          </button>
                        ) : status === 'pending' ? (
                          <div className="flex flex-col items-end gap-1">
                            <div className="text-[10px] text-neutral-500 uppercase tracking-widest font-black">Aguardando aprovação</div>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => cancelFollowRequest(p.id)}
                              className={
                                busy
                                  ? 'px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-500 font-black cursor-not-allowed'
                                  : 'px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black hover:bg-neutral-800 transition-colors'
                              }
                            >
                              Cancelar convite
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => follow(p.id)}
                            className={
                              busy
                                ? 'px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-500 font-black cursor-not-allowed'
                                : 'px-3 py-2 rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400 transition-colors inline-flex items-center gap-2'
                            }
                          >
                            <UserPlus size={16} /> Seguir
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
