import type { BlocoDeCardio } from '@/components/ExerciseEditor/CardioBlocosEditor'

/**
 * O rascunho do modal rápido "Editar exercício" (lápis do card no treino ativo).
 *
 * Existe como TIPO ÚNICO desde 09/09/2026 porque a mesma forma estava escrita à
 * mão em cinco lugares (o hook do estado, três assinaturas do CRUD e um teste), e
 * acrescentar um campo exigia lembrar dos cinco — a cópia que ficasse para trás
 * não quebraria nada visível: o campo simplesmente não chegaria ao componente.
 * É a mesma armadilha do `PrescribedDietPlan`, que fez o professor escrever uma
 * orientação que o aluno nunca via.
 */
export interface EditExerciseDraft {
    name: string
    sets: string
    restTime: string
    method: string
    isUnilateral?: boolean
    sideRestTime?: string | null
    transitionTime?: string | null
    /**
     * Blocos de cardio (tempo · velocidade · inclinação por bloco). Só é
     * preenchido quando o método é Cardio — em exercício de força a chave não
     * existe, e o `saveEditExercise` não escreve nada nas séries por causa dela.
     */
    blocos?: BlocoDeCardio[]
}
