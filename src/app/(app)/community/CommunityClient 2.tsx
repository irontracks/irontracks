'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/utils/supabase/client'
import { Search, UserPlus, UserMinus } from 'lucide-react'

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

const safeString = (v: any) => (v === null || v === undefined ? '' : String(v))

export default function CommunityClient() {
  const supabase = useMemo(() => createClient(), [])
  const [userId, setUserId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [follows, setFollows] = useState<Map<string, FollowRow>>(new Map())
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string>('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data } = await supabase.auth.getUser()
        const uid = data?.user?.id ? String(data.user.id) : ''
        if (!mounted) return
        setUserId(uid)
        if (!uid) {
          setProfiles([])
          setFollows(new Map())
          setLoading(false)
          return
        }

        const [{ data: p }, { data: f }] = await Promise.all([
          supabase.from('profiles').select('id, display_name, photo_url, role').order('display_name', { ascending: true }).limit(500),
          supabase.from('social_follows').select('follower_id, following_id, status').eq('follower_id', uid).limit(5000),
        ])

        if (!mounted) return

        const list = (Array.isArray(p) ? p : [])
          .filter((row) => row && typeof row === 'object')
          .map((row: any) => ({
            id: String(row.id),
            display_name: row.display_name ? String(row.display_name) : null,
            photo_url: row.photo_url ? String(row.photo_url) : null,
            role: row.role ? String(row.role) : null,
          }))
          .filter((row) => row.id && row.id !== uid)

        setProfiles(list)

        const map = new Map<string, FollowRow>()
        ;(Array.isArray(f) ? f : []).forEach((row: any) => {
          const fid = String(row?.following_id || '').trim()
          if (!fid) return
          map.set(fid, {
            follower_id: String(row?.follower_id || '').trim(),
            following_id: fid,
            status: row?.status === 'accepted' ? 'accepted' : 'pending',
          })
        })
        setFollows(map)
      } catch {
        if (!mounted) return
        setProfiles([])
        setFollows(new Map())
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [supabase])

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
      const data = await res.json().catch(() => null)
      if (!data?.ok) {
        if (typeof window !== 'undefined') window.alert(String(data?.error || 'Falha ao seguir'))
        return
      }
      setFollows((prev) => {
        const next = new Map(prev)
        next.set(pid, { follower_id: userId, following_id: pid, status: 'pending' })
        return next
      })
    } catch (e: any) {
      if (typeof window !== 'undefined') window.alert(String(e?.message ?? e))
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
      setFollows((prev) => {
        const next = new Map(prev)
        next.delete(pid)
        return next
      })
    } catch (e: any) {
      if (typeof window !== 'undefined') window.alert(String(e?.message ?? e))
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="min-h-screen bg-neutral-900 text-white p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Comunidade</div>
              <div className="text-white font-black text-xl truncate">Seguir Amigos</div>
              <div className="text-xs text-neutral-400">Siga alunos e professores para receber notificações.</div>
            </div>
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

        {loading ? (
          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 text-sm text-neutral-400">Carregando…</div>
        ) : !userId ? (
          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 text-sm text-neutral-400">
            Faça login para usar a comunidade.
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 text-sm text-neutral-400">
            Nenhum usuário encontrado.
          </div>
        ) : (
          <div className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
            <div className="divide-y divide-neutral-700">
              {filtered.map((p) => {
                const followRow = follows.get(p.id) || null
                const status = followRow?.status || null
                const busy = busyId === p.id
                const name = safeString(p.display_name).trim() || 'Usuário'
                const role = safeString(p.role).trim()
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
                      <div className="text-[11px] text-neutral-400 uppercase tracking-wide truncate">
                        {role || 'usuário'}
                      </div>
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
                      <button
                        type="button"
                        disabled
                        className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-500 font-black cursor-not-allowed"
                      >
                        Solicitado
                      </button>
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
      </div>
    </div>
  )
}
