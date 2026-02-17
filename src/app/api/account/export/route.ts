import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

const isMissingTable = (error: unknown): boolean => {
  const e = error && typeof error === 'object' ? (error as Record<string, unknown>) : {}
  const status = Number(e?.status)
  const code = e?.code ? String(e.code) : ''
  const msg = e?.message ? String(e.message) : ''
  return status === 404 || code === '42P01' || /does not exist/i.test(msg) || /not found/i.test(msg)
}

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const userId = user.id
    const outData: Record<string, unknown> = {}

    const out: Record<string, unknown> = {
      ok: true,
      generatedAt: new Date().toISOString(),
      userId,
      data: outData,
    }

    const safeSelect = async (
      table: string,
      query: unknown,
    ): Promise<
      | { ok: true; rows: Array<Record<string, unknown>>; missing?: boolean }
      | { ok: false; error: unknown }
    > => {
      try {
        const q = query as Promise<{ data: unknown; error: unknown }>
        const { data, error } = await q
        if (error) {
          if (isMissingTable(error)) return { ok: true, rows: [], missing: true }
          return { ok: false, error }
        }
        return { ok: true, rows: (Array.isArray(data) ? data : []).filter((r) => r && typeof r === 'object') as Array<Record<string, unknown>> }
      } catch (e) {
        if (isMissingTable(e)) return { ok: true, rows: [], missing: true }
        return { ok: false, error: e }
      }
    }

    const profileRes = await safeSelect(
      'profiles',
      admin.from('profiles').select('*').eq('id', userId).limit(1)
    )
    if (!profileRes.ok) return NextResponse.json({ ok: false, error: profileRes.error?.message ?? String(profileRes.error) }, { status: 500 })
    outData.profile = profileRes.rows?.[0] || null

    const settingsRes = await safeSelect(
      'user_settings',
      admin.from('user_settings').select('*').eq('user_id', userId).limit(1)
    )
    if (!settingsRes.ok) return NextResponse.json({ ok: false, error: settingsRes.error?.message ?? String(settingsRes.error) }, { status: 500 })
    outData.userSettings = settingsRes.rows?.[0] || null

    const workoutsRes = await safeSelect(
      'workouts',
      admin.from('workouts').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(500)
    )
    if (!workoutsRes.ok) return NextResponse.json({ ok: false, error: workoutsRes.error?.message ?? String(workoutsRes.error) }, { status: 500 })
    const workoutIds = (workoutsRes.rows || []).map((w: Record<string, unknown>) => w?.id).filter(Boolean)
    outData.workouts = workoutsRes.rows || []

    const exercisesRes = workoutIds.length
      ? await safeSelect('exercises', admin.from('exercises').select('*').in('workout_id', workoutIds))
      : { ok: true, rows: [] }
    if (!exercisesRes.ok) return NextResponse.json({ ok: false, error: exercisesRes.error?.message ?? String(exercisesRes.error) }, { status: 500 })
    const exerciseIds = (exercisesRes.rows || []).map((e: Record<string, unknown>) => e?.id).filter(Boolean)
    outData.exercises = exercisesRes.rows || []

    const setsRes = exerciseIds.length
      ? await safeSelect('sets', admin.from('sets').select('*').in('exercise_id', exerciseIds))
      : { ok: true, rows: [] }
    if (!setsRes.ok) return NextResponse.json({ ok: false, error: setsRes.error?.message ?? String(setsRes.error) }, { status: 500 })
    outData.sets = setsRes.rows || []

    const activeSessionsRes = await safeSelect(
      'active_workout_sessions',
      admin.from('active_workout_sessions').select('*').eq('user_id', userId).limit(50)
    )
    if (!activeSessionsRes.ok) return NextResponse.json({ ok: false, error: activeSessionsRes.error?.message ?? String(activeSessionsRes.error) }, { status: 500 })
    outData.activeWorkoutSessions = activeSessionsRes.rows || []

    const notificationsRes = await safeSelect(
      'notifications',
      admin.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(500)
    )
    if (!notificationsRes.ok) return NextResponse.json({ ok: false, error: notificationsRes.error?.message ?? String(notificationsRes.error) }, { status: 500 })
    outData.notifications = notificationsRes.rows || []

    const messagesRes = await safeSelect(
      'messages',
      admin.from('messages').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1000)
    )
    if (!messagesRes.ok) return NextResponse.json({ ok: false, error: messagesRes.error?.message ?? String(messagesRes.error) }, { status: 500 })
    outData.globalChatMessages = messagesRes.rows || []

    const directChannelsRes = await safeSelect(
      'direct_channels',
      admin
        .from('direct_channels')
        .select('*')
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(500)
    )
    if (!directChannelsRes.ok) return NextResponse.json({ ok: false, error: directChannelsRes.error?.message ?? String(directChannelsRes.error) }, { status: 500 })
    const directChannelIds = (directChannelsRes.rows || []).map((c: Record<string, unknown>) => c?.id).filter(Boolean)
    outData.directChannels = directChannelsRes.rows || []

    const directMessagesRes = directChannelIds.length
      ? await safeSelect(
          'direct_messages',
          admin.from('direct_messages').select('*').in('channel_id', directChannelIds).order('created_at', { ascending: false }).limit(5000)
        )
      : { ok: true, rows: [] }
    if (!directMessagesRes.ok) return NextResponse.json({ ok: false, error: directMessagesRes.error?.message ?? String(directMessagesRes.error) }, { status: 500 })
    outData.directMessages = directMessagesRes.rows || []

    const invitesRes = await safeSelect(
      'invites',
      admin.from('invites').select('*').or(`from_uid.eq.${userId},to_uid.eq.${userId}`).order('created_at', { ascending: false }).limit(500)
    )
    if (!invitesRes.ok) return NextResponse.json({ ok: false, error: invitesRes.error?.message ?? String(invitesRes.error) }, { status: 500 })
    outData.invites = invitesRes.rows || []

    const appointmentsRes = await safeSelect(
      'appointments',
      admin
        .from('appointments')
        .select('*')
        .or(`student_id.eq.${userId},teacher_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(500)
    )
    if (!appointmentsRes.ok) return NextResponse.json({ ok: false, error: appointmentsRes.error?.message ?? String(appointmentsRes.error) }, { status: 500 })
    outData.appointments = appointmentsRes.rows || []

    const assessmentsRes = await safeSelect(
      'assessments',
      admin.from('assessments').select('*').or(`student_id.eq.${userId},trainer_id.eq.${userId}`).order('created_at', { ascending: false }).limit(500)
    )
    if (!assessmentsRes.ok) return NextResponse.json({ ok: false, error: assessmentsRes.error?.message ?? String(assessmentsRes.error) }, { status: 500 })
    const assessmentIds = (assessmentsRes.rows || []).map((a: Record<string, unknown>) => a?.id).filter(Boolean)
    outData.assessments = assessmentsRes.rows || []

    const photosRes = assessmentIds.length
      ? await safeSelect('assessment_photos', admin.from('assessment_photos').select('*').in('assessment_id', assessmentIds))
      : { ok: true, rows: [] }
    if (!photosRes.ok) return NextResponse.json({ ok: false, error: photosRes.error?.message ?? String(photosRes.error) }, { status: 500 })
    outData.assessmentPhotos = photosRes.rows || []

    return NextResponse.json(out)
  } catch (e) {
    const msg = (e as Record<string, unknown>)?.message
    return NextResponse.json({ ok: false, error: typeof msg === 'string' ? msg : String(e) }, { status: 500 })
  }
}
