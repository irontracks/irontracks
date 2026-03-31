/**
 * GET  /api/progress-photos  — list user's progress photos (newest first)
 * POST /api/progress-photos  — save a new progress photo after Cloudinary upload
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const PostSchema = z.object({
  url: z.string().url(),
  kind: z.enum(['progress', 'front', 'side', 'back']).default('progress'),
  notes: z.string().max(500).optional(),
  weight_kg: z.number().min(20).max(500).optional(),
  date: z.string().optional(),
})

export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('photos')
    .select('id, url, kind, notes, weight_kg, date, created_at')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, photos: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const parsed = await parseJsonBody(req, PostSchema)
  if (parsed.response) return parsed.response
  const { url, kind, notes, weight_kg, date } = parsed.data!

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('photos')
    .insert({
      user_id: auth.user.id,
      url,
      kind,
      notes: notes ?? null,
      weight_kg: weight_kg ?? null,
      date: date ? new Date(date).toISOString() : new Date().toISOString(),
    })
    .select('id, url, kind, notes, weight_kg, date, created_at')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, photo: data })
}
