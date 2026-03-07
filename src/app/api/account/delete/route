import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'

export const dynamic = 'force-dynamic'

const BodySchema = z
  .object({
    confirm: z.string().min(1),
  })
  .strip()

const isMissingTable = (error: unknown) => {
  const e = error !== null && typeof error === 'object' ? (error as Record<string, unknown>) : {}
  const status = Number(e.status)
  const code = e.code ? String(e.code) : ''
  const msg = e.message ? String(e.message) : ''
  return status === 404 || code === '42P01' || /does not exist/i.test(msg) || /not found/i.test(msg)
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`account:delete:${user.id}:${ip}`, 3, 10 * 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const confirm = String(body?.confirm || '').trim().toUpperCase()
    if (confirm !== 'EXCLUIR') return NextResponse.json({ ok: false, error: 'invalid_confirm' }, { status: 400 })

    const admin = createAdminClient()
    const userId = user.id

    const safeDelete = async (query: PromiseLike<{ error: unknown }>) => {
      try {
        const { error } = await query
        if (error && !isMissingTable(error)) throw error
      } catch (e: unknown) {
        if (isMissingTable(e)) return
        throw e
      }
    }

    const safeSelectIds = async (query: PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }>, key: string) => {
      try {
        const { data, error } = await query
        if (error) {
          if (isMissingTable(error)) return []
          throw error
        }
        const rows = Array.isArray(data) ? data : []
        return rows.map((r: Record<string, unknown>) => r?.[key]).filter(Boolean)
      } catch (e: unknown) {
        if (isMissingTable(e)) return []
        throw e
      }
    }

    await safeDelete(admin.from('active_workout_sessions').delete().eq('user_id', userId))

    const assessmentIds = await safeSelectIds(
      admin.from('assessments').select('id').or(`student_id.eq.${userId},trainer_id.eq.${userId}`).limit(2000),
      'id'
    )
    if (assessmentIds.length) {
      await safeDelete(admin.from('assessment_photos').delete().in('assessment_id', assessmentIds))
      await safeDelete(admin.from('assessments').delete().in('id', assessmentIds))
    }

    await safeDelete(admin.from('appointments').delete().or(`student_id.eq.${userId},teacher_id.eq.${userId}`))

    await safeDelete(admin.from('notifications').delete().eq('user_id', userId))
    await safeDelete(admin.from('messages').delete().eq('user_id', userId))
    await safeDelete(admin.from('invites').delete().or(`from_uid.eq.${userId},to_uid.eq.${userId}`))

    const directChannelIds = await safeSelectIds(
      admin.from('direct_channels').select('id').or(`user1_id.eq.${userId},user2_id.eq.${userId}`).limit(2000),
      'id'
    )
    if (directChannelIds.length) {
      await safeDelete(admin.from('direct_messages').delete().in('channel_id', directChannelIds))
      await safeDelete(admin.from('direct_channels').delete().in('id', directChannelIds))
    }

    const workoutIds = await safeSelectIds(
      admin.from('workouts').select('id').eq('user_id', userId).limit(5000),
      'id'
    )
    if (workoutIds.length) {
      const exerciseIds = await safeSelectIds(
        admin.from('exercises').select('id').in('workout_id', workoutIds).limit(20000),
        'id'
      )
      if (exerciseIds.length) {
        await safeDelete(admin.from('sets').delete().in('exercise_id', exerciseIds))
        await safeDelete(admin.from('exercises').delete().in('id', exerciseIds))
      }
      await safeDelete(admin.from('workouts').delete().in('id', workoutIds))
    }

    await safeDelete(admin.from('user_settings').delete().eq('user_id', userId))

    try {
      await admin.auth.admin.deleteUser(userId)
    } catch {
    }

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
