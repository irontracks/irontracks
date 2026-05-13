// Sub-rota /dashboard/history — renderiza o mesmo DashboardClientEntry
// que /dashboard/page.tsx. IronTracksAppClient lê `usePathname()` e decide
// qual view exibir (substitui `view: string` local state). Vantagens:
//   - URL real ('/dashboard/history') → deep-link OK, back-button OK
//   - Providers/hooks/initial data compartilhados (sem refetch)
//   - Capacitor + Sentry + Realtime preservados
//
// O server NÃO faz prefetch específico aqui — `useWorkoutFetch` (Query) já
// carrega via cache no first render. Initial data vem do dashboard/page.tsx
// quando user entra primeiro lá; se entra direto via deep-link, o cache
// localStorage providence zero-flicker mesmo aqui.
import DashboardClientEntry from '../DashboardClientEntry'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function HistoryPage() {
  // Auth check (mesma lógica de dashboard/page.tsx, sem fetch pesado)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id) redirect('/?next=/dashboard/history')

  const initialUser = {
    id: user.id,
    email: user.email ?? null,
    user_metadata: user.user_metadata ?? {},
  }

  return <DashboardClientEntry initialUser={initialUser} initialProfile={null} initialWorkouts={[]} />
}
