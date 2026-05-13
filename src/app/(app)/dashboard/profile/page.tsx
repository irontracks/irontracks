// Sub-rota /dashboard/profile — página de perfil do usuário.
import DashboardClientEntry from '../DashboardClientEntry'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id) redirect('/?next=/dashboard/profile')

  const initialUser = {
    id: user.id,
    email: user.email ?? null,
    user_metadata: user.user_metadata ?? {},
  }

  return <DashboardClientEntry initialUser={initialUser} initialProfile={null} initialWorkouts={[]} />
}
