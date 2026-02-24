import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseJsonBody } from '@/utils/zod'
import { createAdminClient } from '@/utils/supabase/admin'

const BodySchema = z.object({
  email: z.string().email(),
  full_name: z.string().optional(),
})

export async function POST(req: Request) {
  try {
    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response
    const body = parsed.data!

    const email = String(body.email || '').trim().toLowerCase()
    const fullName = String(body.full_name || '').trim()
    if (!email) return NextResponse.json({ ok: false, error: 'missing_email' }, { status: 400 })

    const admin = createAdminClient()

    const { data: existingStudent } = await admin
      .from('students')
      .select('id,email')
      .eq('email', email)
      .maybeSingle()

    const { data: existingTeacher } = await admin
      .from('teachers')
      .select('id,email')
      .eq('email', email)
      .maybeSingle()

    if (existingStudent?.id || existingTeacher?.id) {
      return NextResponse.json({ ok: true, existed: true })
    }

    const safeName =
      fullName ||
      email.split('@')[0]?.replace(/[^a-zA-Z0-9\s._-]/g, '').trim() ||
      'Aluno'

    const { error } = await admin
      .from('students')
      .insert({ name: safeName, email })

    if (error) {
      return NextResponse.json({ ok: false, error: error.message || 'insert_failed' }, { status: 400 })
    }

    return NextResponse.json({ ok: true, inserted: true })
  } catch {
    return NextResponse.json({ ok: false, error: 'unexpected_error' }, { status: 500 })
  }
}
