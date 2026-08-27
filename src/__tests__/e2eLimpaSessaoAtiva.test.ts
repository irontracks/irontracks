import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const spec = readFileSync(join(process.cwd(), 'e2e/authenticated-workout-journey.spec.ts'), 'utf8')

/**
 * A jornada logada divide `active_workout_sessions` com todo cliente da conta
 * de teste, e a linha vive no SERVIDOR — sobrevive entre execuções do CI.
 *
 * Quando um caso falha, a página fica no estado que o derrubou (modal aberto,
 * hidratação pela metade), e é justamente aí que o descarte pela UI não
 * funciona. A sessão fica, e o PRÓXIMO run — de outro PR, de outra pessoa —
 * morre em "a lista de treinos precisa ter ao menos um card".
 *
 * Aconteceu três vezes em 26/08/2026 (#937 duas vezes, #940 uma), e nas três a
 * investigação começou pelo diff do PR, que não tinha nada a ver. Um deles
 * chegou a ser dividido em dois para bisseccionar um culpado inexistente.
 *
 * O que este guard trava não é "a limpeza funciona" — isso o teste não pode
 * garantir, porque depende da UI. É que ela **não falha em silêncio**.
 */
describe('E2E da jornada: a sessão não pode ficar órfã em silêncio', () => {
  it('o descarte informa se conseguiu — não devolve void', () => {
    expect(
      spec,
      'descartarSessao precisa devolver boolean; com `Promise<void>` o chamador não tem como saber que falhou',
    ).toMatch(/async function descartarSessao\([^)]*\):\s*Promise<boolean>/)
  })

  it('a falha do descarte é ANUNCIADA no log do CI', () => {
    const afterEach = spec.slice(spec.indexOf('test.afterEach('), spec.indexOf('test.afterAll('))
    expect(
      afterEach,
      'o `.catch(() => {})` que embrulhava o descarte tornava a sessão órfã invisível',
    ).toMatch(/avisarSessaoOrfa/)
    expect(spec, 'o aviso precisa dizer COMO destravar, senão vira ruído').toMatch(/delete from active_workout_sessions/)
  })

  it('há uma última tentativa com página NOVA depois de todos os casos', () => {
    expect(
      spec,
      'sem afterAll, o único descarte roda na página que o caso quebrou — que é quando ele menos funciona',
    ).toMatch(/test\.afterAll\(/)
    const afterAll = spec.slice(spec.indexOf('test.afterAll('))
    expect(afterAll, 'a última tentativa precisa de contexto limpo, não da página herdada').toMatch(/newContext\(/)
    expect(afterAll, 'contexto novo sem storageState não está logado e não descarta nada').toMatch(/storageState/)
    expect(afterAll, 'contexto aberto e não fechado vaza o browser entre arquivos').toMatch(/\.close\(\)/)
  })
})
