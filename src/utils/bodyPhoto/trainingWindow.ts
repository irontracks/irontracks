/**
 * trainingWindow — agrega o treino REAL executado numa janela de datas, pra
 * correlacionar com a avaliação por foto.
 *
 * Fonte: linhas da tabela `workouts` com is_template=false (sessões concluídas).
 * O campo `notes` é um JSON-snapshot da sessão: { logs, exercises, totalTime... }.
 *   - logs: Record<"exIdx-setIdx", { weight, reps, done, set_type, is_warmup }>
 *   - exercises: Array<{ name, ... }>
 *
 * Só séries WORKING contam (warmup/feeler ignoradas), igual ao resto do app.
 */
import { isRecord } from '@/utils/report/formatters'

export interface ExerciseVolume {
    name: string
    volumeKg: number
    sets: number
}

export interface TrainingWindowStats {
    sessions: number
    totalVolumeKg: number
    totalSets: number
    /** Top exercícios por volume (desc). */
    topExercises: ExerciseVolume[]
}

interface SessionRow {
    notes?: unknown
}

const parseNotes = (raw: unknown): Record<string, unknown> | null => {
    if (isRecord(raw)) return raw
    if (typeof raw === 'string' && raw.trim()) {
        try {
            const v = JSON.parse(raw)
            return isRecord(v) ? v : null
        } catch {
            return null
        }
    }
    return null
}

/** Reps podem vir como "8/10" (feito/planejado) ou "8" ou "8,5". */
const parseReps = (raw: unknown): number => {
    const s = String(raw ?? '').replace(',', '.').trim()
    if (!s) return 0
    const first = s.includes('/') ? s.split('/')[0].trim() : s
    const n = Number(first)
    return Number.isFinite(n) && n > 0 ? n : 0
}

const parseWeight = (raw: unknown): number => {
    const n = Number(String(raw ?? '').replace(',', '.').trim())
    return Number.isFinite(n) && n > 0 ? n : 0
}

const isWorkingLog = (log: Record<string, unknown>): boolean => {
    const t = (log.set_type ?? log.setType) as string | null | undefined
    if (t === 'warmup' || t === 'feeler') return false
    if (t === 'working') return true
    return !(log.is_warmup ?? log.isWarmup)
}

/** Índice do exercício a partir da chave "exIdx-setIdx". */
const exIdxFromKey = (key: string): number => {
    const head = String(key).split('-')[0]
    const n = Number.parseInt(head, 10)
    return Number.isFinite(n) ? n : -1
}

/**
 * Agrega as sessões de uma janela em estatísticas de treino por exercício.
 * `rows` já deve vir filtrado por user + datas (is_template=false).
 */
export function aggregateTrainingWindow(rows: SessionRow[], topN = 8): TrainingWindowStats {
    let totalVolumeKg = 0
    let totalSets = 0
    let sessions = 0
    const byExercise = new Map<string, ExerciseVolume>()

    for (const row of rows) {
        const notes = parseNotes(row?.notes)
        if (!notes) continue
        const logs = isRecord(notes.logs) ? (notes.logs as Record<string, unknown>) : null
        if (!logs) continue
        const exercises = Array.isArray(notes.exercises) ? (notes.exercises as unknown[]) : []
        const nameByIdx = (idx: number): string => {
            const ex = exercises[idx]
            const name = isRecord(ex) ? String(ex.name ?? '').trim() : ''
            return name || `Exercício ${idx + 1}`
        }

        let sessionHadVolume = false
        for (const [key, value] of Object.entries(logs)) {
            if (!isRecord(value)) continue
            if (!isWorkingLog(value)) continue
            const w = parseWeight(value.weight)
            const r = parseReps(value.reps)
            if (w <= 0 || r <= 0) continue
            const vol = w * r
            totalVolumeKg += vol
            totalSets += 1
            sessionHadVolume = true
            const idx = exIdxFromKey(key)
            const name = idx >= 0 ? nameByIdx(idx) : 'Exercício'
            const prev = byExercise.get(name) || { name, volumeKg: 0, sets: 0 }
            prev.volumeKg += vol
            prev.sets += 1
            byExercise.set(name, prev)
        }
        if (sessionHadVolume) sessions += 1
    }

    const topExercises = [...byExercise.values()]
        .sort((a, b) => b.volumeKg - a.volumeKg)
        .slice(0, topN)
        .map((e) => ({ name: e.name, volumeKg: Math.round(e.volumeKg), sets: e.sets }))

    return {
        sessions,
        totalVolumeKg: Math.round(totalVolumeKg),
        totalSets,
        topExercises,
    }
}
