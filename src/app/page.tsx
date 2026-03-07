import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import RecoveryBridgeClient from './recovery-bridge-client'
import LoginGate from './login-gate'

type SP = Record<string, string | string[] | undefined>

export default async function HomePage({ searchParams }: { searchParams?: Promise<SP> }) {
  const sp = await searchParams
  const code = typeof sp?.code === 'string' ? sp.code : ''
  const next = typeof sp?.next === 'string' ? sp.next : ''
  const type = typeof sp?.type === 'string' ? sp.type : ''
  const error = typeof sp?.error === 'string' ? sp.error : ''
  const errorDescription = typeof sp?.error_description === 'string' ? sp.error_description : ''

  if (code) {
    const safeNext = next && next.startsWith('/') ? next : '/dashboard'
    const safeType = String(type || '').trim().toLowerCase()
    if (safeType === 'recovery') {
      redirect(
        `/auth/recovery?code=${encodeURIComponent(code)}&next=${encodeURIComponent(safeNext)}&type=recovery`,
      )
    }
    redirect(
      `/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(safeNext)}`,
    )
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

  return (
    <>
      <RecoveryBridgeClient />
      <LoginGate />
    </>
  )
}
