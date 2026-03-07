import { useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { RealtimeChannel } from '@supabase/supabase-js'
import { scheduleAppNotification } from '@/utils/native/irontracksNative'

interface RealtimeNotificationBridgeProps {
  userId: string | number | null
  setNotification: (n: {
    id: string | null
    text: string
    displayName: string
    photoURL: null
    senderName: string
    type: string
  }) => void
}

const RealtimeNotificationBridge = ({ userId, setNotification }: RealtimeNotificationBridgeProps): null => {
  const safeSetNotification = typeof setNotification === 'function' ? setNotification : null

  useEffect(() => {
    if (!safeSetNotification) return
    let supabase: ReturnType<typeof createClient>
    try {
      supabase = createClient()
    } catch {
      return
    }
    let channel: RealtimeChannel | null = null
    let mounted = true
      ; (async () => {
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

                const rawType = String((n as Record<string, unknown>)?.type ?? '').toLowerCase()
                const title = String((n as Record<string, unknown>)?.title ?? '').trim()
                const message = String((n as Record<string, unknown>)?.message ?? '').trim()
                if (!title || !message) return

                if (rawType === 'story_posted') {
                  try {
                    window.dispatchEvent(new Event('irontracks:stories:refresh'))
                  } catch { }
                }

                safeSetNotification({
                  id: (n as Record<string, unknown>)?.id ? String((n as Record<string, unknown>).id) : null,
                  text: message,
                  displayName: title,
                  photoURL: null,
                  senderName: title,
                  type: rawType || 'broadcast',
                })

                // Also schedule a local iOS notification so it appears on lock screen
                try {
                  const notifId = (n as Record<string, unknown>)?.id
                    ? `notif-${String((n as Record<string, unknown>).id)}`
                    : `notif-${Date.now()}`
                  scheduleAppNotification({
                    id: notifId,
                    title,
                    body: message,
                    delaySeconds: 1,
                  })
                } catch { }
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
  }, [safeSetNotification, userId])

  return null
}

export default RealtimeNotificationBridge
