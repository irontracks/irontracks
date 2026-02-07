import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

const isMissingTable = (error: any) => {
  const status = Number(error?.status)
  const code = error?.code ? String(error.code) : ''
  const msg = error?.message ? String(error.message) : ''
  return status === 404 || code === '42P01' || /does not exist/i.test(msg) || /not found/i.test(msg)
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const confirm = String(body?.confirm || '').trim().toUpperCase()
    if (confirm !== 'EXCLUIR') return NextResponse.json({ ok: false, error: 'invalid_confirm' }, { status: 400 })

    const admin = createAdminClient()
    const userId = user.id

    const safeDelete = async (query: any) => {
      try {
        const { error } = await query
        if (error && !isMissingTable(error)) throw error
      } catch (e: any) {
        if (isMissingTable(e)) return
        throw e
      }
    }

    const safeSelectIds = async (query: any, key: string) => {
      try {
        const { data, error } = await query
        if (error) {
          if (isMissingTable(error)) return []
          throw error
        }
        const rows = Array.isArray(data) ? data : []
        return rows.map((r: any) => r?.[key]).filter(Boolean)
      } catch (e: any) {
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
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

