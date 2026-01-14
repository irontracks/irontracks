import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import IronTracksAppClient from './IronTracksAppClient'

type SP = Record<string, string | string[] | undefined>

export default async function DashboardPage({ searchParams }: { searchParams?: SP }) {
  const code = typeof searchParams?.code === 'string' ? searchParams?.code : ''
  const next = typeof searchParams?.next === 'string' ? searchParams?.next : ''
  if (code) {
    const safeNext = next && next.startsWith('/') ? next : '/dashboard'
    redirect(`/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(safeNext)}`)
  }

  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user?.id) redirect('/?next=/dashboard')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, display_name, photo_url')
    .eq('id', user.id)
    .maybeSingle()

  const initialUser = {
    id: user.id,
    email: user.email ?? null,
    user_metadata: user.user_metadata ?? {},
  }

  const initialProfile = {
    role: profile?.role ?? null,
    display_name: profile?.display_name ?? null,
    photo_url: profile?.photo_url ?? null,
  }

  return <IronTracksAppClient initialUser={initialUser} initialProfile={initialProfile} />
}
