import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import Image from 'next/image'
import { Check, X, UserPlus } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

export default function FollowRequestModalGate(props) {
  const userId = props?.user?.id ? String(props.user.id) : ''
  const supabase = useMemo(() => createClient(), [])
  const [open, setOpen] = useState(false)
  const [notification, setNotification] = useState(null)
  const [followerProfile, setFollowerProfile] = useState(null)
  const openRef = useRef(false)

  useEffect(() => {
    openRef.current = open
  }, [open])

  const followerId = (() => {
    const n = notification && typeof notification === 'object' ? notification : null
    const meta = n?.metadata && typeof n.metadata === 'object' ? n.metadata : null
    return String(n?.sender_id ?? meta?.follower_id ?? '').trim()
  })()

  const loadFollowerProfile = useCallback(async (id) => {
    const fid = String(id || '').trim()
    if (!fid) return null
    try {
      const { data } = await supabase.from('profiles').select('display_name, photo_url').eq('id', fid).maybeSingle()
      return data && typeof data === 'object' ? data : null
    } catch {
      return null
    }
  }, [supabase])

  const openWithNotification = useCallback(async (n) => {
    const safe = n && typeof n === 'object' ? n : null
    if (!safe) return
    if (openRef.current) return
    setNotification(safe)
    const fid = String(safe?.sender_id ?? safe?.metadata?.follower_id ?? '').trim()
    const prof = await loadFollowerProfile(fid)
    setFollowerProfile(prof)
    setOpen(true)
  }, [loadFollowerProfile])

  useEffect(() => {
    if (!userId) return
    let mounted = true
    let channel

    ;(async () => {
      try {
        const { data } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', userId)
          .eq('type', 'follow_request')
          .eq('read', false)
          .order('created_at', { ascending: false })
          .limit(1)
        const n = Array.isArray(data) ? data[0] : null
        if (!mounted || !n) return
        await openWithNotification(n)
      } catch {}
    })()

    try {
      channel = supabase
        .channel(`follow-request-modal:${userId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
          async (payload) => {
            try {
              const n = payload?.new && typeof payload.new === 'object' ? payload.new : null
              if (!n) return
              const type = String(n?.type || '').toLowerCase()
              if (type !== 'follow_request') return
              if (n?.read === true) return
              await openWithNotification(n)
            } catch {}
          }
        )
        .subscribe()
    } catch {}

    return () => {
      mounted = false
      try {
        if (channel) supabase.removeChannel(channel)
      } catch {}
    }
  }, [openWithNotification, supabase, userId])

  const respond = async (decision) => {
    const d = String(decision || '').toLowerCase()
    if (d !== 'accept' && d !== 'deny') return
    if (!followerId) return

    try {
      const res = await fetch('/api/social/follow/respond', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ follower_id: followerId, decision: d }),
      })
      const data = await res.json().catch(() => null)
      if (!data?.ok) {
        if (typeof window !== 'undefined') window.alert(String(data?.error || 'Falha ao responder'))
        return
      }
    } catch (e) {
      if (typeof window !== 'undefined') window.alert(String(e?.message ?? e))
      return
    }

    setOpen(false)
    setNotification(null)
    setFollowerProfile(null)
  }

  if (!open || !userId) return null

  const displayName = String(followerProfile?.display_name || '').trim() || 'Alguém'
  const photoUrl = String(followerProfile?.photo_url || '').trim()
  const title = String(notification?.title || '').trim() || 'Solicitação para seguir'
  const message = String(notification?.message || '').trim() || `${displayName} quer te seguir.`

  return (
    <div className="fixed inset-0 z-[1500] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-neutral-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center overflow-hidden">
            {photoUrl ? (
              <Image src={photoUrl} alt="" width={40} height={40} className="w-full h-full object-cover" unoptimized />
            ) : (
              <UserPlus size={18} className="text-yellow-500" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Social</div>
            <div className="text-white font-black text-lg truncate">{title}</div>
          </div>
        </div>

        <div className="p-4">
          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4">
            <div className="text-sm font-black text-white">{displayName}</div>
            <div className="text-xs text-neutral-300 mt-1">{message}</div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-4">
            <button
              type="button"
              onClick={() => respond('accept')}
              className="min-h-[44px] rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400 transition-colors inline-flex items-center justify-center gap-2"
            >
              <Check size={16} /> Aceitar
            </button>
            <button
              type="button"
              onClick={() => respond('deny')}
              className="min-h-[44px] rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-black hover:bg-neutral-700 transition-colors inline-flex items-center justify-center gap-2"
            >
              <X size={16} /> Negar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
