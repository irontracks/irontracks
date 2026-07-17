import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeWorkoutTitle } from '@/utils/workoutTitle'

/**
 * Porta ÚNICA de escrita do treino que o PROFESSOR monta pro aluno.
 *
 * Antes, os caminhos do painel (criar manual, wizard, aplicar template, editar template)
 * faziam `supabase.from('exercises').insert({ sets, reps, rpe, ... })` — mas a tabela
 * `exercises` NÃO tem as colunas `sets`/`reps`/`rpe` (elas são normalizadas na tabela
 * `sets`). O PostgREST rejeitava o insert inteiro → o exercício sumia. O editor do ALUNO
 * nunca sofreu disso porque usa a RPC `save_workout_atomic` (useExerciseEditorLogic.ts).
 *
 * Aqui espelhamos exatamente esse caminho: convertemos o formato do AdminWorkoutEditor
 * (sets escalar + reps/rpe únicos por exercício) OU um template do banco (sets já como
 * array de linhas) no payload jsonb que a RPC espera, e chamamos a mesma RPC. A RLS
 * (`*_insert_silo`) garante que o professor só grava pra aluno DELE (created_by = self,
 * is_template = true) — a função é SECURITY INVOKER, então respeita a RLS.
 */

type UnknownRecord = Record<string, unknown>

/** Primeiro valor não-vazio (trim) da lista; '' se nenhum. */
function firstNonEmpty(...vals: unknown[]): string {
    for (const v of vals) {
        const s = String(v ?? '').trim()
        if (s) return s
    }
    return ''
}

/**
 * Resolve o texto do exercício que vai pra coluna `notes`.
 *
 * O AdminWorkoutEditor tem UM campo de texto livre — o "COACH" (`coachNotes`) — e não expõe
 * `notes`. Então, quando o exercício vem do editor, `coachNotes` é a fonte da verdade
 * MESMO quando vazio: o professor limpar o campo tem que APAGAR a nota. Distinguir
 * "definido-porém-vazio" (limpou → apaga) de "ausente" (template do banco, que traz `notes`
 * mas nunca `coachNotes` → preserva) é o que evita a nota ressuscitar no save. Um
 * firstNonEmpty(coachNotes, notes) trataria '' como ausente e reviveria a nota antiga.
 */
function resolveExerciseNotes(ex: UnknownRecord): string {
    const coach = ex.coachNotes
    if (coach !== undefined && coach !== null) return String(coach).trim()
    return String(ex.notes ?? '').trim()
}

/** Uma linha de `sets` no formato que a RPC lê (mesmas chaves de useExerciseEditorLogic). */
export interface TeacherSetPayload {
    weight: unknown
    reps: unknown
    rpe: unknown
    set_number: number
    completed: boolean
    is_warmup: boolean
    set_type: 'working' | 'warmup' | 'feeler'
    advanced_config: unknown
}

export interface TeacherExercisePayload {
    name: string
    notes: string
    video_url: string | null
    rest_time: unknown
    cadence: unknown
    method: unknown
    order: number
    is_unilateral: boolean
    sets: TeacherSetPayload[]
}

/**
 * Converte os exercícios do editor/template no array jsonb da RPC.
 * - `sets` pode chegar escalar (editor/wizard) ou como array de linhas (template do banco).
 * - `coachNotes` (único campo de texto livre do AdminWorkoutEditor) tem prioridade sobre
 *   `notes` — não concatena, porque o editor do professor não tem campo `notes` separado
 *   e concatenar acumularia lixo a cada reabertura.
 */
export function buildTeacherExercisesPayload(exercises: unknown): TeacherExercisePayload[] {
    const list = Array.isArray(exercises) ? exercises : []
    return list
        .filter((ex): ex is UnknownRecord => !!ex && typeof ex === 'object')
        .map((ex, idx) => {
            const setDetails = Array.isArray(ex.setDetails)
                ? ex.setDetails
                : Array.isArray(ex.set_details)
                    ? ex.set_details
                    : Array.isArray(ex.sets)
                        ? ex.sets
                        : null
            const headerSets = Number.parseInt(String(ex.sets ?? ''), 10) || 0
            const numSets = headerSets || (Array.isArray(setDetails) ? setDetails.length : 0)
            const sets: TeacherSetPayload[] = []
            for (let i = 0; i < numSets; i += 1) {
                const s = Array.isArray(setDetails) ? setDetails[i] : null
                const sObj = s && typeof s === 'object' ? (s as UnknownRecord) : {}
                const rawType = (sObj.set_type ?? sObj.setType) as string | undefined
                const setType: TeacherSetPayload['set_type'] =
                    rawType === 'warmup' || rawType === 'feeler' || rawType === 'working'
                        ? rawType
                        : (sObj.is_warmup ?? sObj.isWarmup) ? 'warmup' : 'working'
                sets.push({
                    weight: sObj.weight ?? null,
                    reps: (sObj.reps ?? ex.reps) ?? null,
                    rpe: (sObj.rpe ?? ex.rpe) ?? null,
                    set_number: Number(sObj.set_number ?? sObj.setNumber ?? i + 1),
                    completed: false,
                    is_warmup: setType === 'warmup',
                    set_type: setType,
                    advanced_config: (sObj.advanced_config ?? sObj.advancedConfig) ?? null,
                })
            }
            return {
                name: firstNonEmpty(ex.name),
                notes: resolveExerciseNotes(ex),
                video_url: (firstNonEmpty(ex.videoUrl, ex.video_url) || null),
                rest_time: (ex.restTime ?? ex.rest_time) ?? null,
                cadence: ex.cadence ?? null,
                method: ex.method ?? null,
                order: idx,
                is_unilateral: !!(ex.isUnilateral ?? ex.is_unilateral),
                sets,
            }
        })
}

export interface SaveTeacherWorkoutParams {
    /** null/omitido = cria; id = atualiza (delete+reinsert via RPC). */
    workoutId?: string | null
    /** Dono do treino = workouts.user_id (o ALUNO; ou o próprio professor ao editar um template dele). */
    ownerUserId: string
    /** Autor = workouts.created_by (o professor logado). */
    authorUserId: string
    title: string
    notes?: string
    exercises: unknown
}

export interface SaveTeacherWorkoutResult {
    ok: boolean
    workoutId?: string
    error?: string
}

/**
 * Chama `save_workout_atomic` com o payload já convertido. Client-safe (recebe o supabase
 * como argumento). Todos os caminhos do painel passam por aqui.
 */
export async function saveTeacherWorkout(
    supabase: SupabaseClient,
    params: SaveTeacherWorkoutParams,
): Promise<SaveTeacherWorkoutResult> {
    const { data, error } = await supabase.rpc('save_workout_atomic', {
        p_workout_id: params.workoutId ?? null,
        p_user_id: params.ownerUserId,
        p_created_by: params.authorUserId,
        p_is_template: true,
        p_name: normalizeWorkoutTitle(params.title || 'Treino'),
        p_notes: params.notes ?? '',
        p_exercises: buildTeacherExercisesPayload(params.exercises),
    })
    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: false, error: 'Falha ao salvar treino' }
    return { ok: true, workoutId: String(data) }
}
