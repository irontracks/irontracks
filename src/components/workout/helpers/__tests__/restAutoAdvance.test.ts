import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { shouldAutoAdvanceRest } from '../restAutoAdvance'

/**
 * Barreiras da regressão do auto-start do descanso (START/AUTO), 2026-07-24.
 *
 * Bug: o botão AUTO da barra de descanso e o toggle "START automático" das
 * Configurações eram DOIS controles desconectados. O overlay ignorava a preferência
 * (`autoStartEnabled`/`onToggleAutoStart` chegavam como props mas eram descartadas
 * com `_`) e gateava por um estado próprio em localStorage. Resultado: o auto-start
 * não obedecia o liga/desliga e o START disparava "sozinho".
 *
 * A correção unifica tudo na preferência `restTimerAutoStart` (fonte única). Estes
 * testes travam (1) a porta lógica pura e (2) a fiação que regrediu.
 */

describe('shouldAutoAdvanceRest — porta lógica pura', () => {
  it('AUTO desligado NUNCA auto-avança, mesmo com o descanso terminado', () => {
    expect(shouldAutoAdvanceRest({ isFinished: true, autoOn: false })).toBe(false)
  })

  it('descanso ainda correndo não auto-avança, mesmo com AUTO ligado', () => {
    expect(shouldAutoAdvanceRest({ isFinished: false, autoOn: true })).toBe(false)
  })

  it('só auto-avança com descanso terminado E AUTO ligado', () => {
    expect(shouldAutoAdvanceRest({ isFinished: true, autoOn: true })).toBe(true)
  })

  it('ambos desligados → não auto-avança', () => {
    expect(shouldAutoAdvanceRest({ isFinished: false, autoOn: false })).toBe(false)
  })
})

describe('RestTimerOverlay — fiação única (source-guard)', () => {
  const src = readFileSync('src/components/workout/RestTimerOverlay.tsx', 'utf8')

  it('usa as props do setting (não as descarta com `_autoStartEnabled`/`_onToggleAutoStart`)', () => {
    expect(src).not.toMatch(/autoStartEnabled:\s*_autoStartEnabled/)
    expect(src).not.toMatch(/onToggleAutoStart:\s*_onToggleAutoStart/)
  })

  it('o estado do AUTO deriva da preferência persistida (autoStartEnabled)', () => {
    expect(src).toMatch(/useState<boolean>\(\s*!!autoStartEnabled\s*\)/)
    expect(src).toMatch(/setAutoOn\(\s*!!autoStartEnabled\s*\)/)
  })

  it('o botão AUTO persiste no setting via onToggleAutoStart (não em localStorage)', () => {
    expect(src).toMatch(/onToggleAutoStart\?\.\(\)/)
    // A chave localStorage do controle paralelo antigo foi extinta como fonte de verdade.
    expect(src).not.toMatch(/localStorage\.(get|set)Item\(\s*['"]irontracks\.restTimerAuto\.v1/)
  })

  it('o gate do auto-advance passa pela porta pura (nunca dispara com AUTO off)', () => {
    expect(src).toMatch(/shouldAutoAdvanceRest\(\{\s*isFinished,\s*autoOn\s*\}\)/)
  })
})

describe('fiação do overlay + default seguro (source-guard)', () => {
  it('DashboardModals liga o overlay à preferência restTimerAutoStart', () => {
    const modals = readFileSync('src/app/(app)/dashboard/DashboardModals.tsx', 'utf8')
    expect(modals).toMatch(/autoStartEnabled=\{Boolean\([\s\S]*?restTimerAutoStart[\s\S]*?\)\}/)
    expect(modals).toMatch(/restTimerAutoStart:\s*!s\.restTimerAutoStart/)
  })

  it('a preferência nasce DESLIGADA (sem opt-in explícito, nada auto-inicia)', () => {
    const schema = readFileSync('src/schemas/settings.ts', 'utf8')
    expect(schema).toMatch(/restTimerAutoStart:\s*z\.boolean\(\)\.default\(false\)/)
  })
})
