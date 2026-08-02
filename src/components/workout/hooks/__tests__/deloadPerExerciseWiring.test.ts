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

  it('o consentimento é do TREINO, e o legado por exercício ainda é respeitado', () => {
    // ago/2026: a decisão migrou para o escopo do treino. A lista antiga
    // (`autoLoadDeloadOff`) continua sendo lida — quem já tinha um exercício
    // desligado não pode ver a carga voltar a cair sem ter pedido.
    expect(src).toMatch(/deloadOffWorkouts\.has\(currentWorkoutKey\)/)
    expect(src).toMatch(/deloadOffSet\.has\(normalizeExerciseKey\(name\)\)/)
  })

  it('a chave do treino entra nas deps do memo (recalcula ao ligar/desligar)', () => {
    expect(src).toMatch(/deloadOffWorkoutsKey/)
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

  it('o card NÃO tem mais liga/desliga de deload — a decisão é do treino', () => {
    // Se este botão voltar ao card, voltam as oito decisões para uma coisa só.
    const card = readFileSync('src/components/workout/ExerciseCard.tsx', 'utf8')
    expect(card).not.toMatch(/toggleExerciseDeload\?\.\(exIdx\)/)
    expect(card).not.toMatch(/Deload \{deloadOn \? 'ON' : 'OFF'\}/)
    // mas o modal manual (para quem NÃO usa a carga automática) segue vivo
    expect(card).toMatch(/openDeloadModal\(ex, exIdx\)/)
    expect(card).toMatch(/autoLoadEnabled \? null : \(/)
  })

  it('o controle único vive no topo da lista, com a chave do treino', () => {
    const banner = readFileSync('src/components/workout/SessionDeloadBanner.tsx', 'utf8')
    expect(banner).toMatch(/if \(autoLoadEnabled\) \{/)
    expect(banner).toMatch(/toggleWorkoutDeload/)
    expect(banner).toMatch(/Descarga do treino/)
    const ctrl = readFileSync('src/components/workout/useActiveWorkoutController.ts', 'utf8')
    // chave = NOME DO TREINO normalizado, não nome de exercício
    expect(ctrl).toMatch(/const workoutDeloadKey = useMemo\(/)
    expect(ctrl).toMatch(/onToggleWorkoutDeload\?\.\(workoutDeloadKey/)
  })

  it('o schema guarda os treinos com descarga desligada', () => {
    const schema = readFileSync('src/schemas/settings.ts', 'utf8')
    expect(schema).toMatch(/autoLoadDeloadOffWorkouts:\s*z\.array\(z\.string\(\)\)\.default\(\[\]\)/)
  })
})
