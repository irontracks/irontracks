/**
 * Fixtures REALISTAS das duas rotas quentes do boot (histórico + bootstrap).
 *
 * Não são "mocks bonitinhos": reproduzem o shape que sai do banco em produção —
 * o JSON de sessão de `workouts.notes` no formato exato de
 * `buildFinishWorkoutPayload` (logs "exIdx-setIdx", exercises com setDetails,
 * check-ins, reportMeta, insights de IA) e as linhas cruas com as MESMAS colunas
 * que os `select(...)` das rotas pedem hoje.
 *
 * Usadas pelos guards de orçamento de payload:
 *  - `src/utils/history/__tests__/historyPayloadBudget.test.ts`
 *  - `src/app/api/dashboard/__tests__/bootstrapPayloadShape.test.ts`
 *
 * Se uma fixture ficar irreal (sessão minúscula), o guard passa a medir ar e
 * para de proteger — por isso o volume/logs aqui é o de um treino de verdade.
 */

type Rec = Record<string, unknown>

const uuid = (prefix: string, i: number) =>
    `${prefix}${String(i).padStart(8, '0')}-1111-4222-8333-444455556666`.slice(0, 36)

const TITULOS = [
    'Treino A — Peito e Tríceps',
    'Treino B — Costas e Bíceps',
    'Treino C — Pernas Completo',
    'Treino D — Ombro e Abdômen',
]

const EXERCICIOS = [
    'Supino reto com barra',
    'Supino inclinado com halteres',
    'Crucifixo na máquina',
    'Tríceps na polia com corda',
    'Tríceps francês com halter',
    'Paralelas assistidas',
    'Remada curvada com barra',
    'Puxada frontal na polia alta',
    'Rosca direta com barra W',
    'Agachamento livre',
    'Leg press 45 graus',
    'Cadeira extensora unilateral',
]

/** Um log de série como o app grava (peso/reps/RPE + telemetria de tempo). */
const makeLog = (exIdx: number, setIdx: number): Rec => ({
    weight: 40 + exIdx * 12.5 + setIdx * 2.5,
    reps: 12 - setIdx,
    rpe: 7 + (setIdx % 3),
    done: true,
    failure: setIdx === 3,
    weightSource: setIdx === 0 ? 'auto' : 'user',
    executionSeconds: 42 + setIdx,
    restSeconds: 90,
    completedAt: `2026-07-${String(10 + (exIdx % 18)).padStart(2, '0')}T10:${String(10 + setIdx).padStart(2, '0')}:00.000Z`,
})

/**
 * JSON de sessão concluída — o conteúdo de `workouts.notes` (TEXT).
 * Default = treino real de hipertrofia: 6 exercícios × 4 séries.
 */
export function makeSessionJson(
    index: number,
    opts: { exercises?: number; setsPerExercise?: number; withAi?: boolean } = {},
): Rec {
    const exCount = opts.exercises ?? 6
    const setCount = opts.setsPerExercise ?? 4

    const logs: Rec = {}
    for (let e = 0; e < exCount; e++) {
        for (let s = 0; s < setCount; s++) logs[`${e}-${s}`] = makeLog(e, s)
    }

    const exercises = Array.from({ length: exCount }, (_, e) => ({
        name: EXERCICIOS[(index + e) % EXERCICIOS.length],
        sets: setCount,
        reps: '8-12',
        rpe: 8,
        cadence: '2-0-2-0',
        restTime: 90,
        method: e % 5 === 0 ? 'drop-set' : 'normal',
        videoUrl: null,
        notes: 'Manter escápulas retraídas, sem rebote na descida.',
        setDetails: Array.from({ length: setCount }, (_, s) => ({
            reps: 12 - s,
            weight: 40 + e * 12.5 + s * 2.5,
            rpe: 7 + (s % 3),
            isWarmup: s === 0,
        })),
    }))

    return {
        workoutTitle: TITULOS[index % TITULOS.length],
        date: `2026-07-${String(1 + (index % 28)).padStart(2, '0')}T09:30:00.000Z`,
        totalTime: 3600 + index * 37,
        realTotalTime: 3600 + index * 37,
        executionTotalSeconds: 1100,
        restTotalSeconds: 2400,
        logs,
        exercises,
        originWorkoutId: uuid('aaaaaaaa', index),
        preCheckin: { sleep: 7, soreness: 3, stress: 4, energy: 8 },
        postCheckin: { rpeSession: 8, mood: 'ótimo', notes: 'Carga subiu no supino.' },
        reportMeta: {
            totalVolume: 12345.5,
            totalSets: exCount * setCount,
            kcal: 412,
            prs: [{ exercise: EXERCICIOS[index % EXERCICIOS.length], e1rm: 132.5 }],
        },
        ...(opts.withAi === false ? {} : { ai: { insights: ['Volume acima da média semanal.', 'Descanso consistente.'] } }),
    }
}

/** Linha crua de `workouts` como o SELECT do histórico devolve (notes = TEXT). */
export function makeHistoryDbRow(index: number, opts?: Parameters<typeof makeSessionJson>[1]): Rec {
    const session = makeSessionJson(index, opts)
    const dia = String(1 + (index % 28)).padStart(2, '0')
    return {
        id: uuid('bbbbbbbb', index),
        name: TITULOS[index % TITULOS.length],
        user_id: uuid('cccccccc', 1),
        date: `2026-07-${dia}`,
        created_at: `2026-07-${dia}T09:30:00.000Z`,
        completed_at: `2026-07-${dia}T10:35:00.000Z`,
        notes: JSON.stringify(session),
        is_template: false,
    }
}

/** Linha crua de `cardio_tracks` (sessão avulsa) como o SELECT do histórico pede. */
export function makeCardioDbRow(index: number): Rec {
    const dia = String(1 + (index % 28)).padStart(2, '0')
    return {
        id: uuid('dddddddd', index),
        activity_type: 'running',
        distance_meters: 5200 + index * 100,
        duration_seconds: 1800 + index * 10,
        avg_pace_min_km: 5.7,
        calories_estimated: 380,
        notes: 'Corrida leve no parque, ritmo confortável.',
        perceived_effort: 6,
        started_at: `2026-07-${dia}T06:00:00.000Z`,
        finished_at: `2026-07-${dia}T06:32:00.000Z`,
        created_at: `2026-07-${dia}T06:00:00.000Z`,
    }
}

/** Linha crua de template (`workouts` do bootstrap) — colunas do SELECT da rota. */
export function makeTemplateDbRow(index: number): Rec {
    return {
        id: uuid('eeeeeeee', index),
        name: TITULOS[index % TITULOS.length],
        notes: 'Progredir 2,5 kg quando fechar 12 reps nas duas primeiras séries.',
        is_template: true,
        user_id: uuid('cccccccc', 1),
        created_by: uuid('cccccccc', 1),
        archived_at: null,
        sort_order: index,
        created_at: '2026-05-01T12:00:00.000Z',
        student_id: null,
    }
}

/** Linhas cruas de `exercises` de um template (colunas do SELECT da rota). */
export function makeTemplateExerciseRows(workoutId: string, index: number, count = 6): Rec[] {
    return Array.from({ length: count }, (_, e) => ({
        id: uuid('ffffffff', index * 100 + e),
        workout_id: workoutId,
        name: EXERCICIOS[(index + e) % EXERCICIOS.length],
        notes: 'Amplitude completa.',
        video_url: null,
        rest_time: 90,
        cadence: '2-0-2-0',
        method: e % 5 === 0 ? 'drop-set' : 'normal',
        order: e,
        is_unilateral: e % 6 === 5,
        side_rest_time: 30,
        transition_time: 15,
    }))
}

/**
 * Linhas cruas de `sets` (colunas do SELECT da rota — inclui o embed
 * `exercises!inner(workout_id)` que o PostgREST devolve dentro de cada série).
 */
export function makeTemplateSetRows(exerciseId: string, workoutId: string, count = 4): Rec[] {
    return Array.from({ length: count }, (_, s) => ({
        id: uuid('99999999', s),
        exercise_id: exerciseId,
        set_number: s + 1,
        reps: 12 - s,
        rpe: 7 + (s % 3),
        weight: 40 + s * 2.5,
        is_warmup: s === 0,
        advanced_config: null,
        exercises: { workout_id: workoutId },
    }))
}

/** Perfil como o SELECT do bootstrap devolve. */
export const PROFILE_ROW: Rec = {
    id: uuid('cccccccc', 1),
    display_name: 'Maicon Benitz',
    photo_url: 'https://cdn.irontracks.com.br/avatars/u1.webp',
    role: 'user',
}
