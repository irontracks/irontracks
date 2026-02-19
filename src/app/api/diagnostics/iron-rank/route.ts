import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

const safeJson = (v: any) => {
  try {
    return JSON.stringify(v)
  } catch {
    return null
  }
}

const parseJson = (raw: any) => {
  try {
    if (!raw) return null
    if (typeof raw === 'object') return raw
    const s = String(raw).trim()
    if (!s) return null
    return JSON.parse(s)
  } catch {
    return null
  }
}

const extractLogs = (notes: any) => {
  const base = notes && typeof notes === 'object' ? notes : null
  if (!base) return null
  const obj = base as Record<string, unknown>
  const session = obj?.session && typeof obj.session === 'object' ? (obj.session as Record<string, unknown>) : null
  const rawSession = obj?.rawSession && typeof obj.rawSession === 'object' ? (obj.rawSession as Record<string, unknown>) : null
  return obj?.logs ?? session?.logs ?? rawSession?.logs ?? null
}

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const admin = createAdminClient()

    const rpcRes = await supabase.rpc('iron_rank_leaderboard', { limit_count: 10 })

    const workoutsCountRes = await admin
      .from('workouts')
      .select('id', { head: true, count: 'exact' })
      .eq('is_template', false)

    const setsCountRes = await admin
      .from('sets')
      .select('id', { head: true, count: 'exact' })
      .or('completed.is.null,completed.eq.true')
      .gt('weight', 0)
      .not('reps', 'is', null)

    const recentWorkoutsRes = await admin
      .from('workouts')
      .select('id, user_id, notes, created_at, date, is_template')
      .eq('is_template', false)
      .order('date', { ascending: false })
      .limit(20)

    const recent = Array.isArray(recentWorkoutsRes.data) ? recentWorkoutsRes.data : []
    const parsedRecent = recent
      .map((w: any) => {
        const notes = parseJson(w?.notes)
        const logs = extractLogs(notes)
        const logsObj = logs && typeof logs === 'object' ? logs : null
        const entries = logsObj ? Object.entries(logsObj) : []
        const doneEntries = entries.filter(([, v]) => {
          const vv = v && typeof v === 'object' ? v : null
          const done = (vv as Record<string, unknown>)?.done ?? (vv as Record<string, unknown>)?.isDone ?? (vv as Record<string, unknown>)?.completed ?? null
          return done === true || String(done || '').toLowerCase() === 'true'
        })
        return {
          id: w?.id ?? null,
          user_id: w?.user_id ?? null,
          has_notes: !!w?.notes,
          notes_type: typeof w?.notes,
          parsed_notes: !!notes,
          logs_path: logs ? 'found' : 'missing',
          logs_entries: entries.length,
          done_entries: doneEntries.length,
          note_keys: notes && typeof notes === 'object' ? Object.keys(notes).slice(0, 30) : [],
          sample_log_keys:
            doneEntries.length && doneEntries[0]?.[1] && typeof doneEntries[0][1] === 'object'
              ? Object.keys(doneEntries[0][1]).slice(0, 30)
              : [],
        }
      })
      .slice(0, 10)

    return NextResponse.json({
      ok: true,
      rpc: {
        error: rpcRes.error ? { message: rpcRes.error.message, code: (rpcRes.error as any).code ?? null } : null,
        rows: Array.isArray(rpcRes.data) ? rpcRes.data.length : 0,
        sample: Array.isArray(rpcRes.data) ? rpcRes.data.slice(0, 5) : null,
      },
      counts: {
        workouts_non_template: workoutsCountRes.count ?? null,
        sets_weight_gt0_reps_notnull_completed_true_or_null: setsCountRes.count ?? null,
      },
      recent_workouts_sample: parsedRecent,
      raw: {
        workouts_count_error: workoutsCountRes.error ? workoutsCountRes.error.message : null,
        sets_count_error: setsCountRes.error ? setsCountRes.error.message : null,
        recent_error: recentWorkoutsRes.error ? recentWorkoutsRes.error.message : null,
        rpc_error_raw: rpcRes.error ? safeJson(rpcRes.error) : null,
      },
    })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ? String(e.message) : String(e), where: 'api/diagnostics/iron-rank' },
      { status: 500 }
    )
  }
}
