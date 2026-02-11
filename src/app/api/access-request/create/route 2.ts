import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { email, phone, full_name, birth_date } = body

    // 1. Validation
    if (!email || !phone || !full_name || !birth_date) {
      return NextResponse.json({ ok: false, error: 'Todos os campos são obrigatórios.' }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ ok: false, error: 'E-mail inválido.' }, { status: 400 })
    }

    // 2. Check duplicate in access_requests
    const supabaseAdmin = createAdminClient()
    
    const { data: existingRequest } = await supabaseAdmin
      .from('access_requests')
      .select('id, status')
      .eq('email', email)
      .maybeSingle()

    if (existingRequest) {
      if (existingRequest.status === 'pending') {
        return NextResponse.json({ ok: false, error: 'Já existe uma solicitação pendente para este e-mail.' }, { status: 400 })
      }
      if (existingRequest.status === 'accepted') {
        return NextResponse.json({ ok: false, error: 'Este e-mail já possui acesso liberado. Faça login.' }, { status: 400 })
      }
      // If rejected, we allow a new request (maybe they fixed the info)
    }

    // 3. Check if user already exists in Auth (Optional, but good UX)
    // Note: This requires admin privileges which we have via createAdminClient
    // But checking auth.users is distinct. Usually we check 'profiles' table.
    const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle()
    
    if (existingProfile) {
        return NextResponse.json({ ok: false, error: 'Usuário já cadastrado. Faça login.' }, { status: 400 })
    }

    // 4. Create Request
    const { error: insertError } = await supabaseAdmin
      .from('access_requests')
      .insert({
        email,
        phone,
        full_name,
        birth_date,
        status: 'pending'
      })

    if (insertError) {
        console.error('Error inserting access request:', insertError)
        return NextResponse.json({ ok: false, error: 'Erro ao salvar solicitação.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, message: 'Solicitação enviada com sucesso!' })

  } catch (error: any) {
    console.error('Access Request Error:', error)
    return NextResponse.json({ ok: false, error: 'Erro interno do servidor.' }, { status: 500 })
  }
}
