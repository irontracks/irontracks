import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Guards da fiação do deload por-exercício (o botão do card virou liga/desliga do
 * motor novo, aposentando o modal manual). O COMPORTAMENTO do motor já é coberto por
 * suggestWeight.test.ts ("deloadEnabled=false: nunca reduz"); aqui travamos os elos de
 * FIAÇÃO cuja quebra é silenciosa — o toggle continuaria na tela sem efeito nenhum.
 */

describe('useWorkoutAutoload passa deloadEnabled por exercício', () => {
  const src = readFileSync('src/components/workout/hooks/useWorkoutAutoload.ts', 'utf8')

  it('lê a lista persistida settings.autoLoadDeloadOff', () => {
    expect(src).toMatch(/settings\?\.autoLoadDeloadOff/)
  })

  it('deriva deloadEnabled da lista e entrega ao motor (senão o toggle vira enfeite)', () => {
    expect(src).toMatch(/deloadEnabled:\s*!deloadOffSet\.has\(normalizeExerciseKey\(name\)\)/)
  })

  it('a chave estável da lista entra nas deps do memo (recalcula ao ligar/desligar)', () => {
    expect(src).toMatch(/deloadOffKey/)
  })
})

describe('persistência e toggle', () => {
  it('o schema tem o campo autoLoadDeloadOff (array de chaves, default vazio)', () => {
    const schema = readFileSync('src/schemas/settings.ts', 'utf8')
    expect(schema).toMatch(/autoLoadDeloadOff:\s*z\.array\(z\.string\(\)\)\.default\(\[\]\)/)
  })

  it('o controller expõe deloadOffKeys + toggleExerciseDeload no contexto', () => {
    const ctrl = readFileSync('src/components/workout/useActiveWorkoutController.ts', 'utf8')
    expect(ctrl).toMatch(/toggleExerciseDeload\?\.\(exIdx\)|toggleExerciseDeload/)
    expect(ctrl).toMatch(/onToggleExerciseDeload\?\.\(key,\s*nextEnabled\)/)
  })

  it('o parent persiste via settings (mesmo padrão do autoLoad)', () => {
    const impl = readFileSync('src/app/(app)/dashboard/IronTracksAppClientImpl.tsx', 'utf8')
    expect(impl).toMatch(/onToggleExerciseDeload=\{/)
    expect(impl).toMatch(/save\?\.\(\{\s*autoLoadDeloadOff:\s*next\s*\}\)/)
  })

  it('o card só mostra o toggle quando a carga automática está ligada (senão mantém o modal antigo)', () => {
    const card = readFileSync('src/components/workout/ExerciseCard.tsx', 'utf8')
    expect(card).toMatch(/autoLoadEnabled \? \(/)
    expect(card).toMatch(/toggleExerciseDeload\?\.\(exIdx\)/)
    expect(card).toMatch(/openDeloadModal\(ex, exIdx\)/) // ramo do modal antigo preservado
  })
})
