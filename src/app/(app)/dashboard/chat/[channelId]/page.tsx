// Sub-rota /dashboard/chat/[channelId] — chat direto com um canal específico.
// IronTracksAppClient lê params via useParams() pra abrir ChatDirectScreen.
import DashboardClientEntry from '../../DashboardClientEntry'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function ChatChannelPage({ params }: { params: Promise<{ channelId: string }> }) {
  await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id) redirect('/?next=/dashboard/chat')

  const initialUser = {
    id: user.id,
    email: user.email ?? null,
    user_metadata: user.user_metadata ?? {},
  }

  return <DashboardClientEntry initialUser={initialUser} initialProfile={null} initialWorkouts={[]} />
}
