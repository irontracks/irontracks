import React, { useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'

const RealtimeNotificationBridge = ({ userId, setNotification }) => {
  useEffect(() => {
    const supabase = createClient()
    let channel
    let mounted = true
    ;(async () => {
      try {
        const resolvedUserId = String(userId || '').trim() || (() => {
          try {
            return ''
          } catch {
            return ''
          }
        })()
        let uid = resolvedUserId
        if (!uid) {
          const { data, error } = await supabase.auth.getUser()
          if (error) return
          const user = data?.user ?? null
          uid = user?.id ? String(user.id) : ''
        }
        if (!uid) return

        channel = supabase
          .channel(`notifications-bridge:${uid}`)
          .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${uid}`
          }, (payload) => {
            try {
              if (!mounted) return
              const n = payload?.new && typeof payload.new === 'object' ? payload.new : null
              if (!n) return

              const rawType = String(n?.type ?? '').toLowerCase()
              const title = String(n?.title ?? '').trim()
              const message = String(n?.message ?? '').trim()
              if (!title || !message) return

              setNotification({
                text: message,
                displayName: title,
                photoURL: null,
                senderName: title,
                type: rawType || 'broadcast',
              })
            } catch {
              return
            }
          })
          .subscribe()
      } catch {
        return
      }
    })()

    return () => {
      mounted = false
      try {
        if (channel) supabase.removeChannel(channel)
      } catch {
        return
      }
    }
  }, [setNotification, userId])

  return null
}

export default RealtimeNotificationBridge
