/**
 * workoutStoryRows.ts — linhas da tabela do layout "Treino" do Story.
 *
 * Extraído de `useStoryComposer` pra ser testável: a regra de QUEM aparece na
 * tabela já deixou exercício de fora em silêncio (o FitDance sumia — ver abaixo).
 *
 * Musculação entra pelo LOG (top set do dia). Cardio (esteira, corrida,
 * FitDance…) não tem peso e muitas vezes nem série concluída — a aula acontece
 * fora do app —, então entra pelo TEMPO planejado do exercício (campo `reps`,
 * em minutos), com as kcal na coluna TOTAL.
 *
 * As kcal vêm do `reportMeta` gravado no fim do treino, NÃO de um cálculo novo:
 * o modelo de cardio depende do peso corporal, que o story não tem — recalcular
 * aqui faria o story divergir do relatório e do PDF.
 */
import { setTopWeightReps } from '@/utils/report/setVolume'
import { isSetCompleted } from '@/utils/report/setCompletion'
import { isCardioExercise } from '@/utils/exercise/isCardio'
import type { WorkoutRow } from '../storyComposerUtils'

const isRecord = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v)

const DASH = '—'

/** Minutos de um cardio (o editor grava o tempo no campo `reps`). */
const cardioMinutesOf = (ex: Record<string, unknown> | null): number => {
    const m = Number(ex?.reps)
    return Number.isFinite(m) && m >= 1 && m <= 240 ? Math.round(m) : 0
}

/** kcal por índice de exercício, lidas do reportMeta salvo na sessão. */
export const kcalByExerciseIndex = (session: unknown): Map<number, number> => {
    const out = new Map<number, number>()
    const s = isRecord(session) ? session : null
    const meta = isRecord(s?.reportMeta) ? s.reportMeta : null
    const list = Array.isArray(meta?.exercises) ? (meta.exercises as unknown[]) : []
    list.forEach((m, i) => {
        if (!isRecord(m)) return
        // `order` é 1-based no reportMeta; a posição no array é o fallback.
        const order = Number(m.order)
        const idx = Number.isFinite(order) && order > 0 ? order - 1 : i
        const k = Number(m.caloriesKcal)
        if (Number.isFinite(k) && k > 0) out.set(idx, Math.round(k))
    })
    return out
}

/**
 * Monta as linhas da tabela. `fallbackRpe` é o RPE do check-in pós-treino,
 * usado quando a série não registrou um.
 */
export const buildWorkoutStoryRows = (
    session: unknown,
    fallbackRpe: number | null = null,
): WorkoutRow[] => {
    const s = isRecord(session) ? session : null
    const exercises = Array.isArray(s?.exercises) ? (s.exercises as unknown[]) : []
    const logs = isRecord(s?.logs) ? s.logs : {}
    const kcalByIdx = kcalByExerciseIndex(session)
    const rpeFallback = fallbackRpe ? String(fallbackRpe) : DASH

    const rows: WorkoutRow[] = []

    exercises.forEach((exRaw, exIdx) => {
        const ex = isRecord(exRaw) ? exRaw : null
        const name = String(ex?.name || '').trim()
        if (!name) return

        const kcal = kcalByIdx.get(exIdx) ?? 0

        // ── Cardio: tempo + kcal, mesmo sem série concluída ───────────────────
        if (isCardioExercise(exRaw)) {
            const minutes = cardioMinutesOf(ex)
            if (minutes <= 0 && kcal <= 0) return
            const cardioRpe = Number(ex?.rpe)
            rows.push({
                name,
                reps: minutes > 0 ? `${minutes}min` : DASH,
                weight: DASH,
                rpe: Number.isFinite(cardioRpe) && cardioRpe > 0 ? String(cardioRpe) : rpeFallback,
                totalReps: kcal > 0 ? String(kcal) : DASH,
            })
            return
        }

        // ── Musculação: top set do dia (mais pesado) ──────────────────────────
        let bestW = 0, bestReps = 0, bestRpe = 0, performed = false
        let totalReps = 0 // soma das reps de TODAS as séries = execuções do exercício
        Object.entries(logs).forEach(([key, log]) => {
            if (Number(key.split('-')[0]) !== exIdx) return
            if (!isRecord(log) || !isSetCompleted(log)) return
            const { weight: w, reps: r } = setTopWeightReps(log)
            if (w <= 0 && r <= 0) return
            performed = true
            if (r > 0) totalReps += r
            if (w > bestW || (w === bestW && r > bestReps)) {
                bestW = w; bestReps = r
                const rn = Number(String(log.rpe ?? log.L_rpe ?? log.R_rpe ?? '').replace(',', '.'))
                bestRpe = Number.isFinite(rn) && rn > 0 ? rn : 0
            }
        })
        if (!performed) return

        rows.push({
            name,
            reps: bestReps > 0 ? String(bestReps) : DASH,
            weight: bestW > 0 ? bestW.toLocaleString('pt-BR') : DASH,
            rpe: bestRpe > 0 ? String(bestRpe) : rpeFallback,
            totalReps: totalReps > 0 ? String(totalReps) : DASH,
        })
    })

    return rows
}
