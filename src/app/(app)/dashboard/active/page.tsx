// Sub-rota /dashboard/active — treino em andamento.
// IronTracksAppClient lê `usePathname()` e renderiza ActiveWorkout view.
// `useLocalPersistence` restore-after-crash agora redireciona pra cá em
// vez de chamar setView('active') (ver useLocalPersistence.ts).
import DashboardClientEntry from '../DashboardClientEntry'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function ActivePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id) redirect('/?next=/dashboard/active')

  const initialUser = {
    id: user.id,
    email: user.email ?? null,
    user_metadata: user.user_metadata ?? {},
  }

  return <DashboardClientEntry initialUser={initialUser} initialProfile={null} initialWorkouts={[]} />
}
