// Sub-rota /dashboard/report/[sessionId] — relatório de treino finalizado.
// IronTracksAppClient lê `usePathname()` + params via `useParams()` e
// renderiza WorkoutReport. Se reportData.current não estiver em memória,
// o componente pode fetchar via sessionId da URL.
import DashboardClientEntry from '../../DashboardClientEntry'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function ReportPage({ params }: { params: Promise<{ sessionId: string }> }) {
  // Destructure pra forçar resolução (Next 16 requer await em params/searchParams)
  await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id) redirect('/?next=/dashboard')

  const initialUser = {
    id: user.id,
    email: user.email ?? null,
    user_metadata: user.user_metadata ?? {},
  }

  return <DashboardClientEntry initialUser={initialUser} initialProfile={null} initialWorkouts={[]} />
}
