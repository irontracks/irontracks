'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'

export const useStableSupabaseClient = () => {
  const [client] = useState(() => createClient())
  return client
}
