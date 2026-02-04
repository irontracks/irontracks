import LoginScreen from '@/components/LoginScreen'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

type SP = Record<string, string | string[] | undefined>

export default async function PublicHomePage({ searchParams }: { searchParams?: SP }) {
  const code = typeof searchParams?.code === 'string' ? searchParams?.code : ''
  const next = typeof searchParams?.next === 'string' ? searchParams?.next : ''
  const error = typeof searchParams?.error === 'string' ? searchParams?.error : ''
  const errorDescription = typeof searchParams?.error_description === 'string' ? searchParams?.error_description : ''

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
