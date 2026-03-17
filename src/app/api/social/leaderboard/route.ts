import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const parseTrainingNumberOrZero = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(String(v || '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/**
 * GET /api/social/leaderboard — Weekly leaderboard among friends
 * Returns rankings: most workouts, highest volume, longest streak
 */
export async function GET(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const userId = String(auth.user.id || '').trim()
    if (!userId) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`social:leaderboard:${userId}:${ip}`, 15, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const admin = createAdminClient()

    // Get who I follow (accepted)
    const { data: followRows } = await admin
      .from('social_follows')
      .select('following_id')
      .eq('follower_id', userId)
      .eq('status', 'accepted')
      .limit(500)

    const friendIds = (Array.isArray(followRows) ? followRows : [])
      .map((r) => String(r?.following_id || '').trim())
      .filter(Boolean)

    // Include self
    const allIds = [...new Set([userId, ...friendIds])]

    // Get profiles
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, display_name, photo_url, role')
      .in('id', allIds)
      .limit(500)

    const profileMap = new Map<string, { displayName: string; photoUrl: string | null; role: string | null }>()
    if (Array.isArray(profiles)) {
      for (const p of profiles) {
        profileMap.set(String(p.id), {
          displayName: p.display_name ? String(p.display_name) : 'Usuário',
          photoUrl: p.photo_url ? String(p.photo_url) : null,
          role: p.role ? String(p.role) : null,
        })
      }
    }

    // Get workouts from this week for all friends
    const monday = new Date()
    monday.setDate(monday.getDate() - monday.getDay() + 1)
    monday.setHours(0, 0, 0, 0)
    const weekStart = monday.toISOString()

    const { data: weekWorkouts } = await admin
      .from('workouts')
      .select('user_id, notes')
      .in('user_id', allIds)
      .eq('is_template', false)
      .gte('date', weekStart)
      .order('date', { ascending: false })
      .limit(5000)

    const workoutRows = Array.isArray(weekWorkouts) ? weekWorkouts : []

    // Build workout count ranking
    const workoutCounts = new Map<string, number>()
    const volumeByUser = new Map<string, number>()

    for (const row of workoutRows) {
      const uid = String(row?.user_id || '').trim()
      if (!uid) continue
      workoutCounts.set(uid, (workoutCounts.get(uid) || 0) + 1)

      // Calculate volume from notes
      try {
        let session: Record<string, unknown> | null = null
        if (typeof row.notes === 'string') {
          try { session = JSON.parse(row.notes) } catch { }
        } else if (row.notes && typeof row.notes === 'object') {
          session = row.notes as Record<string, unknown>
        }
        if (!session) continue
        const exercises = Array.isArray(session.exercises) ? session.exercises : []
        const logs = session.logs && typeof session.logs === 'object' ? session.logs as Record<string, unknown> : {}

        let vol = 0
        exercises.forEach((ex: unknown, exIdx: number) => {
          const exObj = ex && typeof ex === 'object' ? ex as Record<string, unknown> : {}
          const setsCount = Math.max(0, Number(exObj?.sets) || 0)
          for (let s = 0; s < setsCount; s++) {
            const log = logs[`${exIdx}-${s}`]
            if (!log || typeof log !== 'object') continue
            const logObj = log as Record<string, unknown>
            if (!logObj?.done) continue
            const w = parseTrainingNumberOrZero(logObj?.weight)
            const r = parseTrainingNumberOrZero(logObj?.reps)
            vol += w * r
          }
        })
        volumeByUser.set(uid, (volumeByUser.get(uid) || 0) + vol)
      } catch { }
    }

    // Calculate streak for all users
    const streakByUser = new Map<string, number>()
    const { data: allDates } = await admin
      .from('workouts')
      .select('user_id, date')
      .in('user_id', allIds)
      .eq('is_template', false)
      .order('date', { ascending: false })
      .limit(10000)

    const datesByUser = new Map<string, Set<string>>()
    for (const row of Array.isArray(allDates) ? allDates : []) {
      const uid = String(row?.user_id || '').trim()
      if (!uid) continue
      const d = row?.date ? new Date(String(row.date)) : null
      if (!d || Number.isNaN(d.getTime())) continue
      if (!datesByUser.has(uid)) datesByUser.set(uid, new Set())
      datesByUser.get(uid)!.add(d.toISOString().slice(0, 10))
    }

    for (const [uid, days] of datesByUser) {
      const sorted = Array.from(days).sort().reverse()
      let cursor = new Date(`${sorted[0]}T00:00:00.000Z`)
      let s = 0
      while (days.has(cursor.toISOString().slice(0, 10))) {
        s += 1
        cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000)
      }
      streakByUser.set(uid, s)
    }

    // Build rankings
    const buildRanking = (map: Map<string, number>, unit: string) => {
      return allIds
        .map((uid) => ({
          userId: uid,
          ...(profileMap.get(uid) || { displayName: 'Usuário', photoUrl: null, role: null }),
          value: map.get(uid) || 0,
          unit,
          isMe: uid === userId,
        }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value)
        .map((r, i) => ({ ...r, rank: i + 1 }))
    }

    return NextResponse.json({
      ok: true,
      rankings: {
        workouts: buildRanking(workoutCounts, 'treinos'),
        volume: buildRanking(volumeByUser, 'kg'),
        streak: buildRanking(streakByUser, 'dias'),
      },
    })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as { message?: string })?.message ?? String(e) }, { status: 500 })
  }
}
