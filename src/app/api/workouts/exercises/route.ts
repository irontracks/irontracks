/**
 * API: POST /api/workouts/exercises  — adicionar / reordenar / excluir exercício.
 *
 * POR QUE EXISTE (e por que não são actions no client):
 *
 * A lista de treinos é cacheada NO SERVIDOR — `dashboard:bootstrap:<uid>` por
 * 300s e `workouts:list:<uid>` por 60s (Upstash). Escrever direto no Supabase
 * pelo browser mudava o banco e deixava o cache intacto: o refetch trazia o dado
 * ANTIGO por até 5 minutos. Foi exatamente o sintoma relatado — "reordenei, mas
 * ao iniciar o treino veio na ordem velha" e "o exercício só aparece depois de
 * fechar o app".
 *
 * Invalidar o cache do cliente (a query) não bastava: o servidor respondia o
 * mesmo payload velho. Toda escrita em exercício passa por aqui, e a
 * invalidação dos dois caches vai junto — do mesmo jeito que /api/workouts/update
 * já fazia.
 *
 * Acesso: só o DONO do treino (RLS + checagem explícita). Rate limit: 30/min.
 */
import { NextResponse } from 'next/server'
import { unilateralPersistFields } from '@/lib/workout/unilateralPersistFields'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody } from '@/utils/zod'
import { respondDbError } from '@/utils/api/dbError'
import { cacheDeletePattern } from '@/utils/cache'
import { logError } from '@/lib/logger'
import { generateExerciseNote } from '@/utils/workout/exerciseNote'

export const dynamic = 'force-dynamic'

const DEFAULT_REST_SECONDS = 90

const BodySchema = z.object({
    action: z.enum(['add', 'reorder', 'delete']),
    workoutId: z.string().uuid(),
    // add
    exerciseName: z.string().min(1).max(120).optional(),
    muscleGroup: z.string().max(60).nullable().optional(),
    videoUrl: z.string().max(500).nullable().optional(),
    /** Padrão que o exercício veio cobrir — dá foco à instrução gerada. */
    patternLabel: z.string().max(60).nullable().optional(),
    sets: z.number().int().min(1).max(6).optional(),
    // reorder
    orderedExerciseIds: z.array(z.string().uuid()).max(60).optional(),
    // delete
    exerciseId: z.string().uuid().optional(),
}).strip()

export async function POST(req: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.id) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

        const ip = getRequestIp(req)
        const rl = await checkRateLimitAsync(`workouts:exercises:${user.id}:${ip}`, 30, 60_000)
        if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

        const parsed = await parseJsonBody(req, BodySchema)
        if (parsed.response) return parsed.response
        const body = parsed.data!

        const { data: workout, error: wErr } = await supabase
            .from('workouts')
            .select('id, user_id, completed_at')
            .eq('id', body.workoutId)
            .maybeSingle()
        if (wErr) return respondDbError('workouts:exercises:load', wErr)
        if (!workout || (workout as { user_id?: string }).user_id !== user.id) {
            return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
        }
        // Sessão concluída é histórico. E em treino EM ANDAMENTO os logs são
        // indexados por posição ("exIdx-setIdx"): mexer na ordem/quantidade por
        // fora faria o peso de um exercício passar a pertencer a outro.
        if ((workout as { completed_at?: string | null }).completed_at) {
            return NextResponse.json({ ok: false, error: 'workout_completed' }, { status: 409 })
        }

        if (body.action === 'add') {
            const name = String(body.exerciseName || '').trim()
            if (!name) return NextResponse.json({ ok: false, error: 'missing_name' }, { status: 400 })
            const setCount = body.sets ?? 3

            const { data: lastRows } = await supabase
                .from('exercises').select('order').eq('workout_id', body.workoutId)
                .order('order', { ascending: false }).limit(1)
            const lastOrder = Number((lastRows as Array<{ order: number | null }> | null)?.[0]?.order ?? -1)

            // Instrução de execução com o contexto REAL do aluno (restrições e
            // dores inclusas). Exercício mudo no meio de outros explicados é o
            // que o dono reportou; falhar aqui NÃO impede a adição.
            const note = await generateExerciseNote(supabase, {
                userId: user.id,
                exerciseName: name,
                muscleLabel: body.muscleGroup ?? null,
                patternLabel: body.patternLabel ?? null,
            })

            const { data: created, error: exErr } = await supabase
                .from('exercises')
                .insert({
                    workout_id: body.workoutId,
                    name,
                    notes: note,
                    muscle_group: body.muscleGroup ?? null,
                    video_url: body.videoUrl ?? null,
                    rest_time: DEFAULT_REST_SECONDS,
                    order: Number.isFinite(lastOrder) ? lastOrder + 1 : 0,
                    // Exercício novo do picker: nasce bilateral explícito, pela fonte única.
                    ...unilateralPersistFields(body as unknown as Record<string, unknown>),
                })
                .select('id')
                .single()
            if (exErr) return respondDbError('workouts:exercises:add', exErr)

            const exerciseId = String((created as { id?: string } | null)?.id || '')
            if (!exerciseId) return NextResponse.json({ ok: false, error: 'create_failed' }, { status: 500 })

            const { error: setsErr } = await supabase.from('sets').insert(
                Array.from({ length: setCount }, (_, i) => ({
                    exercise_id: exerciseId,
                    set_number: i + 1,
                    reps: '',
                    set_type: 'working',
                    is_warmup: false,
                    completed: false,
                })),
            )
            if (setsErr) return respondDbError('workouts:exercises:add-sets', setsErr)

            await invalidate(user.id)
            return NextResponse.json({ ok: true, exerciseId })
        }

        if (body.action === 'delete') {
            const exId = String(body.exerciseId || '').trim()
            if (!exId) return NextResponse.json({ ok: false, error: 'missing_exercise' }, { status: 400 })
            // `eq('workout_id')` junto: id de exercício de outro treino não apaga nada.
            const { error } = await supabase
                .from('exercises').delete().eq('id', exId).eq('workout_id', body.workoutId)
            if (error) return respondDbError('workouts:exercises:delete', error)
            await invalidate(user.id)
            return NextResponse.json({ ok: true })
        }

        // reorder
        const ids = (body.orderedExerciseIds || []).map((v) => String(v || '').trim()).filter(Boolean)
        if (!ids.length) return NextResponse.json({ ok: false, error: 'missing_order' }, { status: 400 })
        if (new Set(ids).size !== ids.length) return NextResponse.json({ ok: false, error: 'duplicated_ids' }, { status: 400 })

        const { data: rows, error: listErr } = await supabase
            .from('exercises').select('id').eq('workout_id', body.workoutId)
        if (listErr) return respondDbError('workouts:exercises:list', listErr)
        const owned = new Set((rows || []).map((r) => String((r as { id: string }).id)))
        if (ids.some((id) => !owned.has(id))) {
            return NextResponse.json({ ok: false, error: 'exercise_not_in_workout' }, { status: 400 })
        }
        if (ids.length !== owned.size) {
            return NextResponse.json({ ok: false, error: 'incomplete_order' }, { status: 400 })
        }

        for (let i = 0; i < ids.length; i++) {
            const { error } = await supabase
                .from('exercises').update({ order: i }).eq('id', ids[i]).eq('workout_id', body.workoutId)
            if (error) return respondDbError('workouts:exercises:reorder', error)
        }

        await invalidate(user.id)
        return NextResponse.json({ ok: true })
    } catch (e) {
        logError('workouts:exercises', e)
        return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
    }
}

/**
 * Derruba os DOIS caches de lista. Sem isto a escrita some por até 5 minutos —
 * o bootstrap tem TTL de 300s.
 */
async function invalidate(userId: string): Promise<void> {
    await Promise.allSettled([
        cacheDeletePattern(`dashboard:bootstrap:${userId}`),
        cacheDeletePattern(`workouts:list:${userId}*`),
    ])
}
