import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const auth = await requireRole(['admin'])
    if (!auth.ok) return auth.response

    const body = await req.json()
    const { requestId, action } = body

    if (!requestId || !['accept', 'reject'].includes(action)) {
      return NextResponse.json({ ok: false, error: 'Dados inválidos.' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Fetch request details
    const { data: request, error: fetchError } = await admin
      .from('access_requests')
      .select('*')
      .eq('id', requestId)
      .single()

    if (fetchError || !request) {
      return NextResponse.json({ ok: false, error: 'Solicitação não encontrada.' }, { status: 404 })
    }

    if (request.status !== 'pending') {
      return NextResponse.json({ ok: false, error: `Solicitação já processada (${request.status}).` }, { status: 400 })
    }

    if (action === 'reject') {
      // Reject logic
      const { error: updateError } = await admin
        .from('access_requests')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', requestId)

      if (updateError) throw updateError

      // Mock Email
      console.log(`[EMAIL] To: ${request.email} | Subject: Solicitação Recusada | Body: Infelizmente seu pedido foi negado.`)

      return NextResponse.json({ ok: true, message: 'Solicitação recusada.' })
    }

    if (action === 'accept') {
      // Accept logic
      // 1. Create Auth User
      // We use a temp password or generate one. Usually we send a magic link or password reset.
      // Since I can't send real emails easily, I'll generate a password and "log it" (simulation).
      // Or better, create user with email_confirm: true and let them reset password?
      // "enviar um e-mail de boas-vindas com instruções de acesso"
      
      const tempPassword = Math.random().toString(36).slice(-8) + 'Aa1!'
      
      const { data: authUser, error: authError } = await admin.auth.admin.createUser({
        email: request.email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
            full_name: request.full_name,
            phone: request.phone,
            birth_date: request.birth_date
        }
      })

      if (authError) {
        // If user already exists, we might want to just link profile or fail
        if (authError.message.includes('already registered')) {
            // Check if profile exists
             const { data: existingProfile } = await admin.from('profiles').select('id').eq('email', request.email).maybeSingle()
             if (existingProfile) {
                 return NextResponse.json({ ok: false, error: 'Usuário já existe no sistema.' }, { status: 400 })
             }
             // If auth exists but no profile, we can proceed to create profile (edge case)
             // But for now return error to be safe
             return NextResponse.json({ ok: false, error: 'E-mail já cadastrado na autenticação.' }, { status: 400 })
        }
        throw authError
      }

      const userId = authUser.user.id

      // 2. Create Profile
      const { error: profileError } = await admin
        .from('profiles')
        .insert({
            id: userId,
            email: request.email,
            display_name: request.full_name,
            role: 'student', // Default role
            // Add other fields if necessary based on schema
        })

      if (profileError) {
          // Rollback auth user if profile fails? 
          // Ideally yes, but Supabase doesn't support cross-service transactions easily.
          // We'll just report error.
          console.error('Profile creation failed:', profileError)
          await admin.auth.admin.deleteUser(userId) // Attempt rollback
          throw profileError
      }

      // 3. Update Request
      const { error: updateError } = await admin
        .from('access_requests')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', requestId)

      if (updateError) throw updateError

      // Mock Email
      console.log(`[EMAIL] To: ${request.email} | Subject: Bem-vindo ao IronTracks! | Body: Sua conta foi criada. Senha temporária: ${tempPassword}`)

      return NextResponse.json({ ok: true, message: 'Conta criada e acesso liberado.' })
    }

  } catch (e: any) {
    console.error('Access Action Error:', e)
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
