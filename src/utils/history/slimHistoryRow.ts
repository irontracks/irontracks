/**
 * Linha MAGRA do histórico — o servidor resume, o client não baixa a sessão.
 *
 * `workouts.notes` guarda a sessão inteira (todas as séries/pesos/RPE). Até
 * ago/2026 a lista de histórico baixava esse JSON completo para 50-200 treinos
 * só para exibir nome/data/duração/volume — o maior payload do app em 4G.
 *
 * Este módulo extrai no SERVIDOR os 4 números que a lista precisa e descarta o
 * blob. O JSON completo passa a ser buscado sob demanda (abrir detalhe/edição/
 * relatório de período). O volume usa `sessionVolumeKg` — a MESMA fonte única
 * que o client usava — então o número exibido não muda.
 *
 * Guard: `slimHistoryRow.test.ts` (inclui a prova de que `notes` não vaza).
 */
import { sessionVolumeKg } from '@/utils/report/setVolume'
import { countDoneSets } from '@/lib/workout/countsAsWorkout'

type UnknownRecord = Record<string, unknown>

const isRecord = (v: unknown): v is UnknownRecord =>
    v !== null && typeof v === 'object' && !Array.isArray(v)

function parseNotes(notes: unknown): UnknownRecord | null {
    if (isRecord(notes)) return notes
    if (typeof notes !== 'string' || !notes.trim()) return null
    try {
        const parsed: unknown = JSON.parse(notes)
        return isRecord(parsed) ? parsed : null
    } catch {
        return null
    }
}

export interface SlimHistoryRow {
    id: string
    name: string | null
    user_id: string | null
    date: string | null
    created_at: string | null
    completed_at: string | null
    is_template: boolean
    /** Resumo extraído do notes no servidor — a lista renderiza só com isto. */
    workout_title: string | null
    total_time: number
    volume_kg: number
    ex_count: number
    /** Data de dentro da sessão (pode divergir de `date` em treino manual). */
    session_date: string | null
    /** Sessão já tem insights de IA gravados (VipInsightsPanel). */
    has_ai: boolean
    /**
     * Séries efetivamente concluídas.
     *
     * Existe para a lista decidir o que CONTA como treino sem baixar o `notes`
     * inteiro (`countsAsWorkoutFromSummary`). Sem este número, o resumo contava
     * linhas — e uma sessão de 44 s entrava como treino no número que o usuário
     * lê, enquanto o push da semana usava o piso e mostrava outro.
     *
     * Custo: um inteiro por linha. O teto de payload continua valendo.
     */
    done_sets: number
}

export function buildSlimHistoryRow(row: UnknownRecord): SlimHistoryRow {
    const raw = parseNotes(row.notes)
    let volume = 0
    try {
        volume = raw?.logs ? sessionVolumeKg(raw.logs) : 0
    } catch {
        volume = 0
    }
    return {
        id: String(row.id ?? ''),
        name: row.name != null ? String(row.name) : null,
        user_id: row.user_id != null ? String(row.user_id) : null,
        date: row.date != null ? String(row.date) : null,
        created_at: row.created_at != null ? String(row.created_at) : null,
        completed_at: row.completed_at != null ? String(row.completed_at) : null,
        is_template: row.is_template === true,
        workout_title: typeof raw?.workoutTitle === 'string' && raw.workoutTitle.trim() ? raw.workoutTitle : null,
        total_time: Number(raw?.totalTime) || 0,
        volume_kg: Number.isFinite(volume) && volume > 0 ? Math.round(volume * 100) / 100 : 0,
        ex_count: Array.isArray(raw?.exercises) ? raw.exercises.length : 0,
        session_date: typeof raw?.date === 'string' ? raw.date : null,
        has_ai: isRecord(raw?.ai),
        done_sets: countDoneSets(raw as Parameters<typeof countDoneSets>[0]),
    }
}
