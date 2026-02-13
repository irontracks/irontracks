import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { resolveRoleByUser } from '@/utils/auth/route'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user?.id) {
    const { role } = await resolveRoleByUser(user)
    
    // Admins e Professores sempre têm acesso liberado
    if (role === 'admin' || role === 'teacher') {
      return children
    }

    const { data: profile } = await supabase.from('profiles').select('is_approved').eq('id', user.id).maybeSingle()
    if (profile?.is_approved !== true) redirect('/wait-approval')
  }

  return children
}
