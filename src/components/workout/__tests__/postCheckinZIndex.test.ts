import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Source-guard: o modal de Check-out pós-treino precisa ficar ACIMA da barra
 * inferior do descanso (RestTimerOverlay: z-[2100] na barra, z-[2000] no flash).
 *
 * Bug real: quem finalizava o treino com um descanso rolando via a barra
 * (anel "0:12 DESC" + START + AUTO) POR CIMA do modal, cortando "Pular" e
 * "Continuar" — o usuário ficava sem como concluir o check-out.
 *
 * A causa NÃO era o z-index do modal (era z-[1200], já maior que os z-90..z-120
 * dos vizinhos): o <ActiveWorkout> é um `fixed inset-0 z-[50]`, e position +
 * z-index != auto CRIAM UM CONTEXTO DE EMPILHAMENTO. Todo z-index de dentro do
 * ActiveWorkout é refém do 50 do pai, então a disputa real contra a barra
 * (renderizada no DashboardModals = raiz) era 2100 vs 50. Subir o 1200 pra
 * qualquer número NÃO resolve — daí o portal ser parte do invariante.
 *
 * Mesmo remédio do editor de treino ativo (z-[2200] no shell): ver
 * src/app/(app)/dashboard/__tests__/activeEditorZIndex.test.ts.
 */
const modals = readFileSync(join(process.cwd(), 'src/components/workout/Modals.tsx'), 'utf8')
const activeWorkout = readFileSync(join(process.cwd(), 'src/components/ActiveWorkout.tsx'), 'utf8')
const restOverlay = readFileSync(
  join(process.cwd(), 'src/components/workout/RestTimerOverlay.tsx'),
  'utf8',
)

const maxZ = (src: string): number => {
  const matches = [...src.matchAll(/z-\[(\d+)\]/g)].map((m) => Number(m[1]))
  return matches.length ? Math.max(...matches) : 0
}

const checkinIdx = modals.indexOf('{postCheckinOpen &&')
/** Janela justa: a abertura do bloco (onde ficam o createPortal e o z-index). */
const checkinOpening = modals.slice(checkinIdx, checkinIdx + 900)
/** Janela larga: o modal inteiro, até o `document.body` que fecha o portal. */
const checkinBlock = modals.slice(checkinIdx, checkinIdx + 6000)

describe('Check-out pós-treino — acima da barra de descanso', () => {
  it('o bloco do check-out existe', () => {
    expect(checkinIdx).toBeGreaterThan(-1)
  })

  it('é renderizado via portal no document.body (escapa o contexto do ActiveWorkout)', () => {
    expect(modals).toContain("import { createPortal } from 'react-dom'")
    expect(checkinOpening).toContain('createPortal(')
    expect(checkinBlock).toContain('document.body')
  })

  it('o pai que justifica o portal continua criando contexto de empilhamento', () => {
    // Se um dia o ActiveWorkout deixar de ser `fixed z-[50]`, o portal pode ser
    // revisto — mas enquanto for, ele é obrigatório.
    expect(activeWorkout.replace(/\s+/g, ' ')).toContain('fixed inset-0 z-[50]')
  })

  it('usa z-[2300] — acima da barra (2100) e do flash (2000)', () => {
    expect(checkinOpening).toContain('z-[2300]')
  })

  it('a barra do descanso não pode ter passado o check-out', () => {
    expect(maxZ(restOverlay)).toBeLessThan(2300)
  })
})
