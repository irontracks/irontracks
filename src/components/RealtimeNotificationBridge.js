import React, { useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'

const RealtimeNotificationBridge = ({ setNotification }) => {
  useEffect(() => {
    const supabase = createClient()
    let channel
    let mounted = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      channel = supabase
        .channel(`notifications-bridge:${user.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        }, (payload) => {
          if (!mounted) return
          const n = payload.new
          setNotification({
            text: n.message,
            displayName: n.title,
            photoURL: null,
            senderName: n.title
          })
        })
        .subscribe()
    })()

    return () => {
      mounted = false
      if (channel) { createClient().removeChannel(channel) }
    }
  }, [setNotification])

  return null
}

export default RealtimeNotificationBridge
