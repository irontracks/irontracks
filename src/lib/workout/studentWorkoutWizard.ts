import type { WorkoutWizardAnswers, WorkoutDraft } from '@/components/dashboard/WorkoutWizardModal'

/**
 * Ponte entre o Wizard de treino e a rota /api/ai/student-workout.
 *
 * O Wizard antigo chamava /api/ai/workout-wizard, que personaliza pelos dados de QUEM
 * clica (o professor) — errado, o treino é do aluno. A rota student-workout recebe o
 * `studentId` e lê perfil/avaliação/histórico DO ALUNO. Mas os contratos diferem:
 *  - entrada: o Wizard tem um questionário (answers); a rota quer focus/daysPerWeek/limitations;
 *  - saída: a rota devolve { plan: { days: [...] } }; o modal espera WorkoutDraft[].
 * Estas duas funções puras fazem a tradução nos dois sentidos.
 */

type UnknownRecord = Record<string, unknown>

const GOAL_PT: Record<string, string> = {
    hypertrophy: 'hipertrofia',
    strength: 'força',
    conditioning: 'condicionamento físico',
    maintenance: 'manutenção',
}
const SPLIT_PT: Record<string, string> = {
    full_body: 'full body',
    upper_lower: 'superior/inferior',
    ppl: 'push/pull/legs',
}
const LEVEL_PT: Record<string, string> = {
    beginner: 'iniciante',
    intermediate: 'intermediário',
    advanced: 'avançado',
}
const EQUIP_PT: Record<string, string> = {
    gym: 'academia completa',
    home: 'em casa',
    minimal: 'equipamento mínimo',
}
const FOCUS_PT: Record<string, string> = {
    balanced: 'equilibrado',
    upper: 'ênfase em superiores',
    lower: 'ênfase em inferiores',
    push: 'ênfase em empurrar',
    pull: 'ênfase em puxar',
    legs: 'ênfase em pernas',
}

export interface StudentWorkoutRequest {
    studentId: string
    focus: string
    daysPerWeek: number
    limitations?: string
}

/**
 * Converte o questionário do Wizard no payload da rota. O `focus` carrega TODA a intenção
 * do questionário (objetivo, divisão, nível, equipamento, ênfase, tempo) em texto, já que
 * a rota só tem esse campo livre. No modo 'single' força 1 dia (o Wizard quer um treino só).
 */
export function wizardAnswersToStudentPayload(
    answers: WorkoutWizardAnswers,
    studentId: string,
    mode: 'single' | 'program',
): StudentWorkoutRequest {
    const goal = GOAL_PT[answers?.goal] ?? 'hipertrofia'
    const split = SPLIT_PT[answers?.split] ?? ''
    const level = LEVEL_PT[answers?.level] ?? ''
    const equip = EQUIP_PT[answers?.equipment] ?? ''
    const emphasis = FOCUS_PT[answers?.focus] ?? ''
    const minutes = Number(answers?.timeMinutes) || 0

    const focus = [
        goal,
        split ? `divisão ${split}` : '',
        level ? `nível ${level}` : '',
        equip,
        emphasis,
        minutes ? `~${minutes}min por sessão` : '',
    ].filter(Boolean).join('; ')

    const daysPerWeek = mode === 'single' ? 1 : Math.min(7, Math.max(1, Number(answers?.daysPerWeek) || 4))
    const limitations = String(answers?.constraints || '').trim()

    return { studentId, focus, daysPerWeek, ...(limitations ? { limitations } : {}) }
}

/**
 * Converte { plan: { days: [{ name, exercises:[{name,sets,reps,rest,method,notes}] }] } }
 * da rota nos WorkoutDraft[] que o modal/editor consomem (rest → restTime).
 */
export function planToWorkoutDrafts(plan: unknown): WorkoutDraft[] {
    const p = plan && typeof plan === 'object' ? (plan as UnknownRecord) : {}
    const days = Array.isArray(p.days) ? p.days : []
    return days
        .filter((d): d is UnknownRecord => !!d && typeof d === 'object')
        .map((day) => {
            const exercises = Array.isArray(day.exercises) ? day.exercises : []
            return {
                title: String(day.name || p.planName || 'Treino'),
                exercises: exercises
                    .filter((e): e is UnknownRecord => !!e && typeof e === 'object')
                    .map((ex) => ({
                        name: String(ex.name || ''),
                        sets: Number(ex.sets) || 3,
                        reps: String(ex.reps ?? '8-12'),
                        restTime: Number(ex.rest ?? ex.restTime ?? ex.rest_time) || 60,
                        method: String(ex.method || 'Normal'),
                        notes: String(ex.notes || ''),
                    })),
            }
        })
}
