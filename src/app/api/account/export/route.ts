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

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const userId = user.id

    const out: any = {
      ok: true,
      generatedAt: new Date().toISOString(),
      userId,
      data: {},
    }

    const safeSelect = async (table: string, query: any) => {
      try {
        const { data, error } = await query
        if (error) {
          if (isMissingTable(error)) return { ok: true, rows: [], missing: true }
          return { ok: false, error }
        }
        return { ok: true, rows: data || [] }
      } catch (e: any) {
        if (isMissingTable(e)) return { ok: true, rows: [], missing: true }
        return { ok: false, error: e }
      }
    }

    const profileRes = await safeSelect(
      'profiles',
      admin.from('profiles').select('*').eq('id', userId).limit(1)
    )
    if (!profileRes.ok) return NextResponse.json({ ok: false, error: profileRes.error?.message ?? String(profileRes.error) }, { status: 500 })
    out.data.profile = profileRes.rows?.[0] || null

    const settingsRes = await safeSelect(
      'user_settings',
      admin.from('user_settings').select('*').eq('user_id', userId).limit(1)
    )
    if (!settingsRes.ok) return NextResponse.json({ ok: false, error: settingsRes.error?.message ?? String(settingsRes.error) }, { status: 500 })
    out.data.userSettings = settingsRes.rows?.[0] || null

    const workoutsRes = await safeSelect(
      'workouts',
      admin.from('workouts').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(500)
    )
    if (!workoutsRes.ok) return NextResponse.json({ ok: false, error: workoutsRes.error?.message ?? String(workoutsRes.error) }, { status: 500 })
    const workoutIds = (workoutsRes.rows || []).map((w: any) => w?.id).filter(Boolean)
    out.data.workouts = workoutsRes.rows || []

    const exercisesRes = workoutIds.length
      ? await safeSelect('exercises', admin.from('exercises').select('*').in('workout_id', workoutIds))
      : { ok: true, rows: [] }
    if (!exercisesRes.ok) return NextResponse.json({ ok: false, error: exercisesRes.error?.message ?? String(exercisesRes.error) }, { status: 500 })
    const exerciseIds = (exercisesRes.rows || []).map((e: any) => e?.id).filter(Boolean)
    out.data.exercises = exercisesRes.rows || []

    const setsRes = exerciseIds.length
      ? await safeSelect('sets', admin.from('sets').select('*').in('exercise_id', exerciseIds))
      : { ok: true, rows: [] }
    if (!setsRes.ok) return NextResponse.json({ ok: false, error: setsRes.error?.message ?? String(setsRes.error) }, { status: 500 })
    out.data.sets = setsRes.rows || []

    const activeSessionsRes = await safeSelect(
      'active_workout_sessions',
      admin.from('active_workout_sessions').select('*').eq('user_id', userId).limit(50)
    )
    if (!activeSessionsRes.ok) return NextResponse.json({ ok: false, error: activeSessionsRes.error?.message ?? String(activeSessionsRes.error) }, { status: 500 })
    out.data.activeWorkoutSessions = activeSessionsRes.rows || []

    const notificationsRes = await safeSelect(
      'notifications',
      admin.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(500)
    )
    if (!notificationsRes.ok) return NextResponse.json({ ok: false, error: notificationsRes.error?.message ?? String(notificationsRes.error) }, { status: 500 })
    out.data.notifications = notificationsRes.rows || []

    const messagesRes = await safeSelect(
      'messages',
      admin.from('messages').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1000)
    )
    if (!messagesRes.ok) return NextResponse.json({ ok: false, error: messagesRes.error?.message ?? String(messagesRes.error) }, { status: 500 })
    out.data.globalChatMessages = messagesRes.rows || []

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
    const directChannelIds = (directChannelsRes.rows || []).map((c: any) => c?.id).filter(Boolean)
    out.data.directChannels = directChannelsRes.rows || []

    const directMessagesRes = directChannelIds.length
      ? await safeSelect(
          'direct_messages',
          admin.from('direct_messages').select('*').in('channel_id', directChannelIds).order('created_at', { ascending: false }).limit(5000)
        )
      : { ok: true, rows: [] }
    if (!directMessagesRes.ok) return NextResponse.json({ ok: false, error: directMessagesRes.error?.message ?? String(directMessagesRes.error) }, { status: 500 })
    out.data.directMessages = directMessagesRes.rows || []

    const invitesRes = await safeSelect(
      'invites',
      admin.from('invites').select('*').or(`from_uid.eq.${userId},to_uid.eq.${userId}`).order('created_at', { ascending: false }).limit(500)
    )
    if (!invitesRes.ok) return NextResponse.json({ ok: false, error: invitesRes.error?.message ?? String(invitesRes.error) }, { status: 500 })
    out.data.invites = invitesRes.rows || []

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
    out.data.appointments = appointmentsRes.rows || []

    const assessmentsRes = await safeSelect(
      'assessments',
      admin.from('assessments').select('*').or(`student_id.eq.${userId},trainer_id.eq.${userId}`).order('created_at', { ascending: false }).limit(500)
    )
    if (!assessmentsRes.ok) return NextResponse.json({ ok: false, error: assessmentsRes.error?.message ?? String(assessmentsRes.error) }, { status: 500 })
    const assessmentIds = (assessmentsRes.rows || []).map((a: any) => a?.id).filter(Boolean)
    out.data.assessments = assessmentsRes.rows || []

    const photosRes = assessmentIds.length
      ? await safeSelect('assessment_photos', admin.from('assessment_photos').select('*').in('assessment_id', assessmentIds))
      : { ok: true, rows: [] }
    if (!photosRes.ok) return NextResponse.json({ ok: false, error: photosRes.error?.message ?? String(photosRes.error) }, { status: 500 })
    out.data.assessmentPhotos = photosRes.rows || []

    return NextResponse.json(out)
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

