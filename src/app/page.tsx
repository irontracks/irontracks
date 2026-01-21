import LoginScreen from '@/components/LoginScreen'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

type SP = Record<string, string | string[] | undefined>

export default async function HomePage({ searchParams }: { searchParams?: Promise<SP> }) {
  const sp = await searchParams
  const code = typeof sp?.code === 'string' ? sp.code : ''
  const next = typeof sp?.next === 'string' ? sp.next : ''
  const error = typeof sp?.error === 'string' ? sp.error : ''
  const errorDescription = typeof sp?.error_description === 'string' ? sp.error_description : ''

  if (code) {
    const safeNext = next && next.startsWith('/') ? next : '/dashboard'
    redirect(`/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(safeNext)}`)
  }

  if (error || errorDescription) {
    const msg = errorDescription || error
    redirect(`/auth/error?error=${encodeURIComponent(msg)}`)
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user?.id) redirect('/dashboard')
  } catch {}

  return <LoginScreen />
}
