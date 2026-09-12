/**
 * O rótulo do método de UMA série, montado uma vez só.
 *
 * `resolveSetMethodLabel` já era a fonte única da DECISÃO, mas os sete insumos
 * dela eram montados à mão dentro do `ExerciseCard` — e essa montagem é a parte
 * fácil de errar: o drop pode não estar em lugar nenhum da série (a nota
 * "DROP-SET na última" faz `getPlannedSet` fabricar o `advanced_config`), o SST
 * vem da nota, e prancha/cardio são decididos ANTES de tudo, por nome.
 *
 * Existe porque o painel de controle do PROFESSOR precisa do mesmo rótulo: ele
 * desenhava toda série como Normal, então quem estivesse fazendo um Drop-set ou
 * um Bi-Set aparecia para o coach como série comum. Copiar a montagem para lá
 * seria a segunda cópia — e o docstring de `resolveSetMethod` já diz o que uma
 * cópia divergente produz: "o app diria 'Normal' numa série desenhada como
 * DROP", que é pior que não rotular.
 *
 * Função PURA: sem React, sem contexto. Recebe o exercício, o índice, o log CRU
 * daquela série e a contagem de séries já resolvida.
 *
 * ⚠️ O `log` tem de ser o objeto CRU do `logs["exIdx-setIdx"]`. Um log
 * reconstruído campo a campo (done/weight/reps/rpe) perde `per_set_method`, que
 * é justamente o que vence tudo na decisão — o mesmo tipo de perda silenciosa do
 * `planDays` da nutrição, que apagava campo na primeira regravação.
 */
import { isPlank } from '@/utils/exerciseTracking'
import { isClusterConfig, isRestPauseConfig } from '../utils'
import { getPlanConfig, getPlannedSet } from './setPlanningHelpers'
import { parseSstFromNotes } from './sstFromNotes'
import { plannedSetMethod, resolveSetMethodLabel } from './resolveSetMethod'
import type { WorkoutExercise } from '../types'

/**
 * `''` significa Normal — a mesma convenção de `resolveSetMethodLabel`.
 *
 * Prancha NÃO é decidida por `resolveSetMethodLabel` (ela não a conhece): no
 * card do aluno o desvio acontece antes, por NOME do exercício. Sem esta linha o
 * painel do professor diria "Normal" numa prancha.
 */
export function rotuloDoMetodoDaSerie(
    ex: unknown,
    setIdx: number,
    log: unknown,
    setsCount: number,
): string {
    const exercicio = (ex ?? {}) as WorkoutExercise
    const nome = String((exercicio as { name?: unknown })?.name ?? '')
    if (isPlank(nome)) return 'Prancha'

    const plannedSet = getPlannedSet(exercicio, setIdx)
    const cfg = getPlanConfig(exercicio, setIdx)
    const sst = parseSstFromNotes((exercicio as { notes?: unknown })?.notes, setsCount)

    return resolveSetMethodLabel({
        exerciseMethod: (exercicio as { method?: unknown })?.method,
        log,
        plannedConfig: plannedSet?.advanced_config ?? plannedSet?.advancedConfig ?? null,
        sstFromNotes: Boolean(sst && setIdx === sst.targetSetIdx),
        plannedMethod: plannedSetMethod(plannedSet),
        isClusterConfig: isClusterConfig(cfg),
        isRestPauseConfig: isRestPauseConfig(cfg),
    })
}
