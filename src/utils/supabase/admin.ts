import { createClient } from '@supabase/supabase-js'
import { env } from '@/utils/env'

export const createAdminClient = () => {
  return createClient(
    env.supabase.url,
    env.supabase.serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}
