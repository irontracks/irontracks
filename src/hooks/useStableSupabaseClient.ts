/**
 * @module useStableSupabaseClient
 *
 * Returns a referentially-stable Supabase client instance. Unlike
 * calling `createClient()` directly in a component body (which creates
 * a new instance every render), this hook stores the client in state
 * so the reference never changes, preventing unnecessary re-renders
 * and subscription reconnections.
 *
 * @returns A stable `SupabaseClient` singleton for the component tree.
 */
'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'

export const useStableSupabaseClient = () => {
  const [client] = useState(() => createClient())
  return client
}
