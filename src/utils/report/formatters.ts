/**
 * Shared formatting & utility functions for the report system.
 * Single source of truth — used by both WorkoutReport.tsx (React) and buildHtml.ts (PDF).
 */
import { stripDiacritics } from '@/utils/normalizeExerciseName'
import { isRecord } from '@/utils/guards'
import { sessionVolumeKg } from './setVolume'

// ─── Type guard (re-export da fonte única em utils/guards) ────────────────────
export { isRecord }

// ─── Date formatting ─────────────────────────────────────────────────────────

/**
 * Resolve a Firestore timestamp, Date, number, or string into a Date object.
 * Returns null if the input is invalid.
 */
export const resolveDate = (ts: unknown): Date | null => {
    if (!ts) return null
    const obj = isRecord(ts) ? ts : null
    const toDateFn = obj && typeof obj.toDate === 'function' ? (obj.toDate as () => unknown) : null
    const raw = toDateFn
        ? toDateFn()
        : new Date(typeof ts === 'number' || typeof ts === 'string' || ts instanceof Date ? ts : String(ts))
    if (!(raw instanceof Date) || Number.isNaN(raw.getTime())) return null
    return raw
}

export const formatDate = (ts: unknown): string => {
    const d = resolveDate(ts)
    if (!d) return ''
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export const formatShortDate = (ts: unknown): string => {
    const d = resolveDate(ts)
    if (!d) return ''
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// ─── Duration & numbers ──────────────────────────────────────────────────────

export const formatDuration = (s: unknown): string => {
    const safe = Number(s) || 0
    const mins = Math.floor(safe / 60)
    const secs = Math.floor(safe % 60)
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

/**
 * Duração em minutos, para EXIBIÇÃO — fonte única.
 *
 * O mesmo treino de 114 s aparecia de quatro jeitos diferentes no app (visto no
 * simulador em 09/08/2026): "1 min" no card do histórico (`Math.floor`), "2 min"
 * no resumo (`Math.round`), "1.9 min" no relatório (`toFixed(1)`, com ponto) e
 * "1min" no story (outro `Math.floor`). Quatro fórmulas para o mesmo número.
 *
 * Isso não é detalhe estético: quando a duração diverge entre telas, o usuário
 * passa a duvidar do volume e das calorias também — e esses ele não tem como
 * conferir.
 *
 * Regra única: **arredonda** (nem chão nem teto), decimal com VÍRGULA quando
 * houver, e minutos abaixo de 1 viram segundos, porque "0 min" para um treino
 * de 40 s é pior que impreciso — é errado.
 */
export const formatMinutesLabel = (seconds: unknown, opts?: { decimals?: 0 | 1 }): string => {
    const safe = Number(seconds)
    if (!Number.isFinite(safe) || safe <= 0) return '0 min'
    if (safe < 60) return `${Math.round(safe)} s`

    const mins = safe / 60
    const casas = opts?.decimals ?? 0
    // `toFixed` sempre devolve ponto; em pt-BR o separador é vírgula, e o app já
    // usa vírgula em ~70 outros lugares.
    const texto = mins.toFixed(casas).replace('.', ',')
    return `${texto} min`
}

export const formatKm = (meters: unknown): string => {
    const m = Number(meters)
    if (!Number.isFinite(m) || m <= 0) return '-'
    return `${(m / 1000).toFixed(2)} km`
}

export const formatKmh = (kmh: unknown): string => {
    const v = Number(kmh)
    if (!Number.isFinite(v) || v <= 0) return '-'
    return `${v.toFixed(1)} km/h`
}

// ─── Exercise key ─────────────────────────────────────────────────────────────

export const normalizeExerciseKey = (v: unknown): string => {
    try {
        // Must match the server-side normalization in workout-report-actions.ts:
        // NFD decomposition + diacritic removal so accented chars match
        // (e.g. "MÁQUINA" → "maquina", "TRÍCEPS" → "triceps").
        return stripDiacritics(String(v || '').trim().toLowerCase())
            .replace(/\s+/g, ' ')
    } catch {
        return ''
    }
}

// ── Volume calculation ──────────────────────────────────────────────────────

// Fina camada sobre `sessionVolumeKg` (setVolume.ts), a fonte ÚNICA do volume
// total. Já houve duas cópias locais aqui — uma sem checar `done`, outra
// reimplementando a soma por série — e ambas divergiram em silêncio do histórico,
// do PDF e do reportMeta. Não reintroduzir a conta: delegar.
export const calculateTotalVolume = (logs: unknown): number => {
    try {
        return sessionVolumeKg(logs)
    } catch {
        return 0
    }
}

