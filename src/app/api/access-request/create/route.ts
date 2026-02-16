import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const BodySchema = z
  .object({
    email: z.string().min(1),
    phone: z.string().optional().nullable(),
    full_name: z.string().min(1),
    birth_date: z.string().optional().nullable(),
    role_requested: z.string().optional().nullable(),
    cref: z.string().optional().nullable(),
  })
  .passthrough()

export async function POST(req: Request) {
  try {
    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const { email, phone, full_name, birth_date, role_requested, cref } = parsedBody.data!

    // 1. Validation
    if (!email || !full_name) {
      return NextResponse.json({ ok: false, error: 'Nome e e-mail são obrigatórios.' }, { status: 400 })
    }

    // Teacher specific validation
    if (role_requested === 'teacher' && !cref) {
      return NextResponse.json({ ok: false, error: 'CREF é obrigatório para cadastro de professor.' }, { status: 400 })
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
        return NextResponse.json({ ok: true, message: 'Solicitação já está pendente.', id: existingRequest.id })
      }
      if (existingRequest.status === 'accepted') {
        return NextResponse.json({ ok: true, message: 'Solicitação já foi aprovada.', id: existingRequest.id })
      }
      // If rejected, allow re-request by updating the same row (email is unique)
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

    // 4. Create / Reset Request
    if (existingRequest?.id && existingRequest.status === 'rejected') {
      const { error: updateError } = await supabaseAdmin
        .from('access_requests')
        .update({
          full_name,
          phone: phone ?? null,
          birth_date: birth_date ?? null,
          role_requested: role_requested || 'student',
          cref: cref || null,
          status: 'pending',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingRequest.id)

      if (updateError) {
        console.error('Error updating access request:', updateError)
        return NextResponse.json({ ok: false, error: 'Erro ao atualizar solicitação.' }, { status: 500 })
      }

      return NextResponse.json({ ok: true, message: 'Solicitação enviada com sucesso!', id: existingRequest.id })
    }

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('access_requests')
      .insert({
        email,
        phone: phone ?? null,
        full_name,
        birth_date: birth_date ?? null,
        role_requested: role_requested || 'student',
        cref: cref || null,
        status: 'pending',
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('Error inserting access request:', insertError)
      return NextResponse.json({ ok: false, error: 'Erro ao salvar solicitação.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, message: 'Solicitação enviada com sucesso!', id: inserted?.id ?? null })

  } catch (error: any) {
    console.error('Access Request Error:', error)
    return NextResponse.json({ ok: false, error: 'Erro interno do servidor.' }, { status: 500 })
  }
}
