import LoginScreen from '@/components/LoginScreen'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function PublicHomePage() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user?.id) redirect('/dashboard')
  } catch {}

  return <LoginScreen />
}

