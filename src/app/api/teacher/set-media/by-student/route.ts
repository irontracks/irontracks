import { NextResponse } from 'next/server'
import { requireRole } from '@/utils/auth/route'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { createAdminClient } from '@/utils/supabase/admin'
import { respondDbError } from '@/utils/api/dbError'
import { respondInternalError } from '@/utils/api/internalError'

export const dynamic = 'force-dynamic'

/**
 * GET /api/teacher/set-media/by-student?student_user_id=…
 * Fotos/vídeos que o aluno anexou às séries, com a resposta da IA — o coach vê
 * a pergunta, a mídia e o que a IA disse (decisão do dono, 02/09/2026).
 */
export async function GET(req: Request) {
  const auth = await requireRole(['teacher', 'admin'])
  if (!auth.ok) return auth.response
  const requesterId = String(auth.user.id)
  const ip = getRequestIp(req)
  const rl = await checkRateLimitAsync(`teacher:set-media:${requesterId}:${ip}`, 60, 60_000)
  if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
  try {
    const url = new URL(req.url)
    const studentUserId = String(url.searchParams.get('student_user_id') || '').trim()
    if (!/^[0-9a-f-]{36}$/i.test(studentUserId)) return NextResponse.json({ ok: false, error: 'student_user_id_required' }, { status: 400 })
    const admin = createAdminClient()
    if (auth.role !== 'admin') {
      const { data: s } = await admin.from('students').select('id').eq('user_id', studentUserId).eq('teacher_id', requesterId).maybeSingle()
      if (!s) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }
    const { data: rows, error } = await admin
      .from('workout_set_media')
      .select('id, workout_id, exercise_index, set_index, exercise_name, kind, bucket_id, object_path, mime_type, question, ai_status, ai_answer, analyzed_at, created_at')
      .eq('user_id', studentUserId)
      .order('created_at', { ascending: false })
      .limit(40)
    if (error) return respondDbError('api:teacher:set-media:by-student', error)
    const items = await Promise.all((Array.isArray(rows) ? rows : []).map(async (r) => {
      const { data: signed } = await admin.storage.from(String(r.bucket_id)).createSignedUrl(String(r.object_path), 60 * 60)
      return {
        id: r.id, workoutId: r.workout_id, exerciseIndex: r.exercise_index, setIndex: r.set_index,
        exerciseName: r.exercise_name, kind: r.kind, mime: r.mime_type, question: r.question,
        aiStatus: r.ai_status, aiAnswer: r.ai_answer, analyzedAt: r.analyzed_at, createdAt: r.created_at,
        url: signed?.signedUrl || null,
      }
    }))
    return NextResponse.json({ ok: true, items }, { headers: { 'cache-control': 'no-store, max-age=0' } })
  } catch (e: unknown) {
    return respondInternalError('api:teacher:set-media:by-student', e)
  }
}
