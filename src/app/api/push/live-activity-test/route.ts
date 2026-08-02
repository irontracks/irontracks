/**
 * POST /api/push/live-activity-test
 *
 * Dev / TestFlight diagnostic — sends a sample APNs Live Activity update to
 * the calling user's most recent token. Useful to verify Feature 11 wiring
 * end-to-end (token capture → DB → APNs → Dynamic Island).
 *
 * Body: { kind: "rest" | "workout", event?: "update" | "end" }
 * Response: { ok: boolean, results?: Array<{ token, ok, error? }> }
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { sendLiveActivityUpdate } from '@/lib/push/apnsLiveActivity'
import { parseJsonBody } from '@/utils/zod'

const BodySchema = z.object({
  kind: z.string().optional(),
  event: z.string().optional(),
}).passthrough()

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    // Ferramenta de diagnóstico — só admin (defense-in-depth; a UI já esconde de
    // não-admin, mas a rota não pode confiar só nisso).
    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (String((me as { role?: string } | null)?.role || '').toLowerCase() !== 'admin') {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const parsed = await parseJsonBody(request, BodySchema)
    const body = parsed.data ?? {}
    const kindStr = String(body?.kind ?? 'workout').toLowerCase()
    const eventStr = String(body?.event ?? 'update').toLowerCase()

    if (kindStr !== 'rest' && kindStr !== 'workout') {
      return NextResponse.json({ ok: false, error: 'invalid kind' }, { status: 400 })
    }
    if (eventStr !== 'update' && eventStr !== 'end') {
      return NextResponse.json({ ok: false, error: 'invalid event' }, { status: 400 })
    }

    let results
    if (kindStr === 'workout') {
      results = await sendLiveActivityUpdate({
        userId: user.id,
        kind: 'workout',
        event: eventStr as 'update' | 'end',
        contentState: {
          currentExerciseName: 'Supino Reto',
          currentSetIndex: 3,
          totalSetsForExercise: 4,
          totalSetsCompleted: 7,
          totalVolumeKg: 2340,
        },
        alert: eventStr === 'update'
          ? { title: 'IronTracks', body: 'Update da Dynamic Island recebido!' }
          : undefined,
      })
    } else {
      const endDate = new Date(Date.now() + 60 * 1000).toISOString()
      results = await sendLiveActivityUpdate({
        userId: user.id,
        kind: 'rest',
        event: eventStr as 'update' | 'end',
        contentState: {
          endDate,
          targetSeconds: 60,
          isFinished: false,
        },
        alert: eventStr === 'update'
          ? { title: 'IronTracks', body: 'Descanso atualizado via APNs!' }
          : undefined,
      })
    }

    return NextResponse.json({ ok: true, results })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
