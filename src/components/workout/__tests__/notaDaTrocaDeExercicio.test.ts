import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A FIAÇÃO da observação gerada ao trocar o exercício.
 *
 * O módulo puro (`lib/workout/exerciseNote.ts`) tem os próprios testes de
 * comportamento. O que se trava aqui é o meio do caminho — a lição que este
 * repo já pagou várias vezes: as duas pontas passam isoladas e ninguém liga
 * uma na outra.
 *
 * Montar o `ExerciseCard` mediria o harness (contexto de treino, provider de
 * logs, ~20 props), não o app — por isso source-guard, e por isso a conferência
 * de tela foi feita à parte.
 */
const SRC = join(__dirname, '..', '..', '..')
const crud = readFileSync(join(SRC, 'components/workout/hooks/useWorkoutExerciseCrud.ts'), 'utf8')
const card = readFileSync(join(SRC, 'components/workout/ExerciseCard.tsx'), 'utf8')
const swapIndividual = readFileSync(join(SRC, 'components/workout/AIExerciseSwap.tsx'), 'utf8')
const header = readFileSync(join(SRC, 'components/workout/WorkoutHeader.tsx'), 'utf8')
const rota = readFileSync(join(SRC, 'app/api/ai/exercise-note/route.ts'), 'utf8')

describe('a troca não deixa a observação do exercício antigo', () => {
    it('swapExerciseName reescreve `notes` — não só o nome', () => {
        // O defeito original: o spread preservava tudo, inclusive a técnica do
        // aparelho que saiu (322 das 384 notas de produção).
        expect(crud).toMatch(/notaAoTrocar/)
        expect(crud).toMatch(/name: trimmed, notes:/)
    })

    it('a nota que volta da IA confere o estado FRESCO antes de escrever', () => {
        // Entre disparar e responder, o usuário pode ter trocado de novo,
        // editado ou apagado. `onUpdateSession` não tem updater funcional.
        expect(crud).toMatch(/estadoFrescoRef/)
        expect(crud, 'só preenche se ainda for o mesmo exercício').toMatch(/!== nome\) return/)
        expect(crud, 'e se o usuário não tiver escrito nada por cima').toMatch(/!== metodo\.trim\(\)\) return/)
    })
})

describe('só a troca INDIVIDUAL chama a IA', () => {
    /**
     * "Adaptar ambiente" troca o treino inteiro num toque. Se ele passasse a
     * flag, um gesto viraria N chamadas pagas ao Gemini — decisão do dono em
     * 03/09/2026: só a troca individual.
     */
    it('a troca individual pede a nota', () => {
        expect(swapIndividual).toMatch(/swapExerciseName\([^)]*gerarNota:\s*true/)
    })

    it('o Adaptar ambiente NÃO pede', () => {
        const chamada = header.match(/aoTrocar=\{[^}]*swapExerciseName\([^)]*\)/)?.[0] ?? ''
        expect(chamada, 'a chamada do lote precisa existir').not.toBe('')
        expect(chamada, 'lote com gerarNota = N chamadas pagas num toque').not.toMatch(/gerarNota/)
    })

    it('gerar nota é opt-in — o default não gasta IA', () => {
        expect(crud).toMatch(/opts\?\.gerarNota/)
    })
})

describe('a nota da máquina não se passa pela palavra do professor', () => {
    /**
     * O campo se chama "Observação do professor" no próprio card. Violeta é a
     * cor da máquina neste app: "violeta = a máquina decidiu, dourado = você
     * decide".
     */
    it('a origem da nota é lida e marcada', () => {
        expect(card).toMatch(/notesSource/)
        expect(card).toMatch(/notaDaMaquina/)
    })

    it('usa o token do design system, não violeta escrito à mão', () => {
        expect(card).toMatch(/MACHINE_ACCENT/)
    })

    it('a marcação é visível — tem rótulo, não só cor', () => {
        // Cor sozinha não comunica para quem não conhece a convenção.
        expect(card).toMatch(/Sugestão automática/)
    })
})

describe('a rota da nota', () => {
    it('não inventa observação para nome irreconhecível', () => {
        // Medido contra a API real: nome sem sentido devolve string vazia.
        expect(rota).toMatch(/sem_nota/)
        expect(rota).toMatch(/if \(!note\)/)
    })

    it('aplica o teto DEPOIS do parse — structured output não garante maxLength', () => {
        expect(rota).toMatch(/slice\(0, MAX_NOTA_CHARS\)/)
    })

    it('a biblioteca é enriquecimento, não requisito', () => {
        // O nome sozinho já produz nota boa (medido); falha na consulta não
        // pode derrubar a geração.
        expect(rota).toMatch(/catch \{ \/\* biblioteca é enriquecimento/)
    })
})
