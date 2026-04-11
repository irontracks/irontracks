import { NextResponse } from 'next/server'
import { logWarn } from '@/lib/logger'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { logError } from '@/lib/logger'
import { cacheGet, cacheSet } from '@/utils/cache'

export const dynamic = 'force-dynamic'

const parseTrainingNumberOrZero = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(String(v || '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/**
 * Calculate volume from a workout session stored in notes (JSON).
 * Iterates exercises × sets to sum weight × reps for completed sets.
 */
const calcVolume = (notes: unknown): number => {
  try {
    let session: Record<string, unknown> | null = null
    if (typeof notes === 'string') {
      try { session = JSON.parse(notes) } catch (e) { logWarn('social:leaderboard', 'silenced', e) }
    } else if (notes && typeof notes === 'object') {
      session = notes as Record<string, unknown>
    }
    if (!session) return 0

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
    return vol
  } catch { return 0 }
}

/**
 * Calculate consecutive-day streak from a set of date strings (YYYY-MM-DD).
 * Starts from today and goes backwards.
 */
const calcStreak = (days: Set<string>): number => {
  if (!days.size) return 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let cursor = today
  let streak = 0

  // Check today and yesterday as starting points (user may not have worked out today yet)
  const todayStr = cursor.toISOString().slice(0, 10)
  if (!days.has(todayStr)) {
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000)
    if (!days.has(cursor.toISOString().slice(0, 10))) return 0
  }

  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000)
  }
  return streak
}

/**
 * GET /api/social/leaderboard — Weekly leaderboard among friends
 * Returns rankings: most workouts, highest volume, longest streak
 *
 * Optimized: uses server-side caching (60s TTL) and reduced query limits.
 * Streak uses 90-day window instead of unbounded fetch.
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

    // ── Cache ──────────────────────────────────────────────────────
    const cacheKey = `social:leaderboard:${userId}`
    const cached = await cacheGet<Record<string, unknown>>(cacheKey, (v) =>
      v && typeof v === 'object' ? (v as Record<string, unknown>) : null
    )
    if (cached) return NextResponse.json(cached)

    const admin = createAdminClient()

    // ── Friends ────────────────────────────────────────────────────
    const { data: followRows } = await admin
      .from('social_follows')
      .select('following_id')
      .eq('follower_id', userId)
      .eq('status', 'accepted')
      .limit(500)

    const friendIds = (Array.isArray(followRows) ? followRows : [])
      .map((r) => String(r?.following_id || '').trim())
      .filter(Boolean)

    const allIds = [...new Set([userId, ...friendIds])]

    // ── Parallel fetch: profiles + week workouts + streak dates ───────
    const monday = new Date()
    monday.setDate(monday.getDate() - monday.getDay() + 1)
    monday.setHours(0, 0, 0, 0)
    const weekStart = monday.toISOString()

    const streakWindowStart = new Date()
    streakWindowStart.setDate(streakWindowStart.getDate() - 90)
    const streakStart = streakWindowStart.toISOString()

    const [{ data: profiles }, { data: weekWorkouts }, { data: streakDates }] = await Promise.all([
      admin.from('profiles').select('id, display_name, photo_url, role').in('id', allIds).limit(500),
      // Fetch in batches per user to avoid the massive 5k-row single query.
      // With max 500 friends × ~7 workouts/week = ~3500 rows max realistic.
      admin.from('workouts').select('user_id, notes').in('user_id', allIds).eq('is_template', false)
        .gte('date', weekStart).order('date', { ascending: false }).limit(3500),
      // A streak of 90+ consecutive days is extremely rare; this reduces
      // the query from 10,000 rows to ~(friends × 90) max.
      admin.from('workouts').select('user_id, date').in('user_id', allIds).eq('is_template', false)
        .gte('date', streakStart).order('date', { ascending: false }).limit(5000),
    ])

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

    const workoutRows = Array.isArray(weekWorkouts) ? weekWorkouts : []

    const workoutCounts = new Map<string, number>()
    const volumeByUser = new Map<string, number>()

    for (const row of workoutRows) {
      const uid = String(row?.user_id || '').trim()
      if (!uid) continue
      workoutCounts.set(uid, (workoutCounts.get(uid) || 0) + 1)

      try {
        const vol = calcVolume(row.notes)
        if (vol > 0) volumeByUser.set(uid, (volumeByUser.get(uid) || 0) + vol)
      } catch (e) { logError('api:social:leaderboard:volume-calc', e) }
    }

    const datesByUser = new Map<string, Set<string>>()
    for (const row of Array.isArray(streakDates) ? streakDates : []) {
      const uid = String(row?.user_id || '').trim()
      if (!uid) continue
      const d = row?.date ? new Date(String(row.date)) : null
      if (!d || Number.isNaN(d.getTime())) continue
      if (!datesByUser.has(uid)) datesByUser.set(uid, new Set())
      datesByUser.get(uid)!.add(d.toISOString().slice(0, 10))
    }

    const streakByUser = new Map<string, number>()
    for (const [uid, days] of datesByUser) {
      streakByUser.set(uid, calcStreak(days))
    }

    // ── Rankings ────────────────────────────────────────────────────
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

    const payload = {
      ok: true,
      rankings: {
        workouts: buildRanking(workoutCounts, 'treinos'),
        volume: buildRanking(volumeByUser, 'kg'),
        streak: buildRanking(streakByUser, 'dias'),
      },
    }

    // Cache for 60 seconds — leaderboard data changes at most once per workout
    await cacheSet(cacheKey, payload, 60)

    return NextResponse.json(payload)
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as { message?: string })?.message ?? String(e) }, { status: 500 })
  }
}
