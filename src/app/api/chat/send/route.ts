import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { parseJsonBody } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const BodySchema = z
  .object({
    channel_id: z.string().min(1),
    content: z.string().min(1),
  })
  .passthrough()

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const { channel_id, content } = parsedBody.data!

    const { data, error } = await supabase
      .from('messages')
      .insert({ channel_id, user_id: user.id, content })
      .select('*')
      .single()

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, message: data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e as any)?.message ?? String(e) }, { status: 500 })
  }
}
