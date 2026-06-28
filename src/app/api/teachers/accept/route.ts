import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getErrorMessage } from '@/utils/errorMessage'
import { safeEmailLike } from '@/utils/safePgFilter'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    const admin = createAdminClient()
    const emailNorm = String(user.email || '').trim()

    // Ground truth de "é professor" = existe registro em `teachers` casando
    // user_id OU email. Esses registros só são criados por admin (rota promote)
    // ou pelo RPC approve_access_request — ambos service-role; usuário comum não
    // consegue auto-inserir. ANTES o role era setado INCONDICIONALMENTE, então
    // qualquer usuário virava `teacher` com um único POST sem body (escalação de
    // privilégio — auditoria 2026-06-27).
    let teacherRowId: string | null = null
    {
      const { data } = await admin.from('teachers').select('id').eq('user_id', user.id).maybeSingle()
      if (data?.id) teacherRowId = String(data.id)
    }
    if (!teacherRowId && emailNorm) {
      const { data } = await admin.from('teachers').select('id').ilike('email', safeEmailLike(emailNorm)).maybeSingle()
      if (data?.id) teacherRowId = String(data.id)
    }

    if (!teacherRowId) {
      // Nenhum convite/registro de professor → NÃO promove.
      return NextResponse.json({ ok: false, error: 'not_a_teacher' }, { status: 403 })
    }

    // Ativa o registro e vincula o user_id; só ENTÃO promove o profile.
    const { error } = await admin
      .from('teachers')
      .update({ status: 'active', user_id: user.id })
      .eq('id', teacherRowId)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    await admin.from('profiles').update({ role: 'teacher' }).eq('id', user.id)
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
