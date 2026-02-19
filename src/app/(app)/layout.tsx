import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { resolveRoleByUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user?.id) {
    const { role } = await resolveRoleByUser(user)
    
    // Admins e Professores sempre têm acesso liberado
    if (role === 'admin' || role === 'teacher') {
      return children
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_approved, approval_status')
      .eq('id', user.id)
      .maybeSingle()
    const approved = profile?.is_approved === true || String(profile?.approval_status || '').toLowerCase() === 'approved'
    if (!approved) {
      const email = String(user.email || '').trim().toLowerCase()
      if (!email) redirect('/wait-approval')

      let allowByRequest = false
      try {
        const admin = createAdminClient()
        const { data: reqRow } = await admin
          .from('access_requests')
          .select('id, status, role_requested, full_name, phone, birth_date, cref')
          .ilike('email', email)
          .maybeSingle()

        const reqStatus = String(reqRow?.status || '').toLowerCase()
        if (reqStatus === 'accepted' || reqStatus === 'approved') {
          allowByRequest = true
          const roleRequested = String(reqRow?.role_requested || 'student').toLowerCase()
          const fullName = String(reqRow?.full_name || '').trim()

          const approvalPayload: Record<string, unknown> = {
            is_approved: true,
            approval_status: 'approved',
            approved_at: new Date().toISOString(),
          }
          if (roleRequested === 'teacher') approvalPayload.role = 'teacher'

          await admin.from('profiles').update(approvalPayload).eq('id', user.id)

          if (roleRequested === 'teacher') {
            const { data: existingTeacher } = await admin.from('teachers').select('id').ilike('email', email).maybeSingle()
            if (existingTeacher?.id) {
              await admin.from('teachers').update({ user_id: user.id }).eq('id', existingTeacher.id)
            } else {
              await admin.from('teachers').insert({
                email,
                name: fullName || email.split('@')[0],
                phone: reqRow?.phone || null,
                user_id: user.id,
                status: 'active',
              })
            }
          } else {
            const { data: existingStudent } = await admin.from('students').select('id').ilike('email', email).maybeSingle()
            if (existingStudent?.id) {
              await admin.from('students').update({ user_id: user.id }).eq('id', existingStudent.id)
            } else {
              const payload: Record<string, unknown> = { email, user_id: user.id }
              if (fullName) payload.name = fullName
              await admin.from('students').insert(payload)
            }
          }
        }
      } catch {}

      if (!allowByRequest) redirect('/wait-approval')
    }
  }

  return children
}
