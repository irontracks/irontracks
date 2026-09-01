import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Source-guard: adicionar/remover série pergunta se vale só HOJE ou também no plano.
 *
 * Antes, `addExtraSetToExercise`/`removeExtraSetFromExercise` mexiam SÓ na sessão e
 * o plano nunca mudava — quem ajustava o treino de verdade repetia o ajuste toda
 * semana, sem nenhuma pista de que aquilo era temporário.
 *
 * INVARIANTES (as três coisas que não podem regredir):
 *  1. as duas operações chamam o prompt;
 *  2. "Só neste treino" é o botão em DESTAQUE (confirmText) — mexer no plano é
 *     irreversível pela tela do treino ativo e exige escolha consciente;
 *  3. só persiste quando o usuário NÃO escolheu "só neste treino" (`if (!onlyToday)`),
 *     e nunca quando o persistidor não existe.
 */
const SRC = readFileSync(
  join(process.cwd(), 'src/components/workout/hooks/useWorkoutExerciseCrud.ts'),
  'utf8',
)

describe('add/remover série — prompt de persistir no plano', () => {
  it('as duas operações chamam o prompt', () => {
    expect(SRC).toMatch(/askPersistSetChange\('add'/)
    expect(SRC).toMatch(/askPersistSetChange\('remove'/)
  })

  it('"Só neste treino" é o botão em destaque e "Salvar no plano" o secundário', () => {
    expect(SRC).toMatch(/confirmText:\s*'Só neste treino'/)
    expect(SRC).toMatch(/cancelText:\s*'Salvar no plano'/)
  })

  it('só grava no plano quando o usuário NÃO escolheu "só neste treino"', () => {
    expect(SRC).toMatch(/if \(!onlyToday\) onPersistWorkoutTemplate\(nextWorkout\)/)
  })

  it('sem persistidor disponível, não pergunta nada', () => {
    expect(SRC).toMatch(/if \(typeof onPersistWorkoutTemplate !== 'function'\) return/)
  })

  it('falha do diálogo mantém a mudança só na sessão (padrão seguro)', () => {
    // O catch NÃO pode persistir — senão um erro de UI mudaria o plano sozinho.
    // Fatia pelo PRÓXIMO `const` de topo do hook, não pelo nome de uma função
    // vizinha: ancorar num vizinho quebra na primeira vez que alguém escreve
    // outra função entre as duas (aconteceu em 01/09/2026, com changeSetMethod).
    const inicio = SRC.indexOf('const askPersistSetChange')
    const resto = SRC.slice(inicio + 1)
    const fn = SRC.slice(inicio, inicio + 1 + resto.indexOf('\n  const '))
    const catchBlock = fn.slice(fn.indexOf('} catch'))
    expect(catchBlock).not.toContain('onPersistWorkoutTemplate(')
  })
})
