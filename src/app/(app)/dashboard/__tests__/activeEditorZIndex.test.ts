import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Source-guard: o editor de treino aberto DURANTE o treino ativo (editActiveOpen)
 * precisa ficar ACIMA da barra inferior do descanso (RestTimerOverlay usa z-[2100]
 * na barra e z-[2000] no flash). Se o editor ficar abaixo, a barra START/AUTO cobre
 * o rodapé do editor e esconde o "+ Adicionar Exercício". Trava o z-index >= 2200.
 */
const shell = readFileSync(
  join(process.cwd(), 'src/app/(app)/dashboard/IronTracksAppClientImpl.tsx'),
  'utf8',
)
const restOverlay = readFileSync(
  join(process.cwd(), 'src/components/workout/RestTimerOverlay.tsx'),
  'utf8',
)

const maxZ = (src: string): number => {
  const matches = [...src.matchAll(/z-\[(\d+)\]/g)].map((m) => Number(m[1]))
  return matches.length ? Math.max(...matches) : 0
}

describe('Editor durante treino ativo — z-index acima do descanso', () => {
  it('editActiveOpen usa z-[2200]', () => {
    // pega o bloco do editActiveOpen e confirma o z-index da camada
    const idx = shell.indexOf('editActiveOpen && view === ')
    expect(idx).toBeGreaterThan(-1)
    const block = shell.slice(idx, idx + 600)
    expect(block).toContain('z-[2200]')
  })

  it('z do editor é maior que o maior z da barra de descanso', () => {
    // sanity: a barra do RestTimerOverlay não pode ter passado o editor.
    expect(maxZ(restOverlay)).toBeLessThan(2200)
  })
})
