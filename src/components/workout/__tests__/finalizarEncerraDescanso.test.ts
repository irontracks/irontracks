/**
 * Finalizar encerra o descanso ANTES de o check-out abrir.
 *
 * Visto no aparelho (auditoria de 06/09/2026, confirmado por segunda auditoria
 * independente): concluir série → descanso rolando → Finalizar → Sim → o
 * check-out pós-treino abria com a barra "1:46 DESC · START ▶ · AUTO" viva por
 * baixo. O treino sendo encerrado e a tela oferecendo iniciar a próxima série.
 *
 * `useWorkoutFinish` só matava a Live Activity nativa (`endAllRestLiveActivities`)
 * — o timer JS, que mora em `activeSession.timerTargetTime`, ninguém zerava.
 *
 * Source-guard, e o limite é declarado: montar o hook de verdade exige sessão,
 * diálogo e seis dependências — o teste mediria o harness. O que se trava aqui
 * é a ORDEM (o descanso morre antes do check-out) e a FIAÇÃO (o controller
 * zera os dois campos que o `handleCloseTimer` da raiz zera).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const semComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')

const finish = semComentarios(
  readFileSync(join(process.cwd(), 'src/components/workout/hooks/useWorkoutFinish.ts'), 'utf8'),
)
const controller = semComentarios(
  readFileSync(join(process.cwd(), 'src/components/workout/useActiveWorkoutController.ts'), 'utf8'),
)

describe('finalizar encerra o descanso antes do check-out', () => {
  const inicio = finish.indexOf('const finishWorkout = async')
  const fim = finish.indexOf('requestPostWorkoutCheckin()', inicio)

  it('as âncoras existem (senão o guard fica cego)', () => {
    expect(inicio).not.toBe(-1)
    expect(fim).not.toBe(-1)
  })

  it('o descanso é encerrado DENTRO de finishWorkout, ANTES do check-out', () => {
    const antesDoCheckout = finish.slice(inicio, fim)
    expect(antesDoCheckout, 'onCloseRestTimer precisa rodar antes de abrir o check-out').toMatch(
      /onCloseRestTimer\?\.\(\)/,
    )
  })

  it('o controller zera os DOIS campos do timer — os mesmos do handleCloseTimer da raiz', () => {
    const chamada = controller.slice(controller.indexOf('onCloseRestTimer:'))
    expect(chamada).toMatch(/timerTargetTime:\s*null/)
    expect(chamada.slice(0, 400)).toMatch(/timerContext:\s*null/)
  })
})
