import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

import {
  DEFAULT_MINI_SETS,
  MIN_MINI_SETS,
  normalizeMiniSets,
  resolvePlannedMiniSets,
} from '../restPauseRules'

/**
 * Piso de mini-séries do Rest-Pause.
 *
 * BUG (print do dono, 03/08/2026): o modal abriu com "1 minis • descanso 15s".
 * Rest-Pause é ativação + pausas curtas + mini-séries; com UMA mini-série o método
 * deixa de existir — vira série normal com uma pausa no meio.
 *
 * Causa: `useWorkoutMethodSavers` gravava `planned_mini_sets: miniReps.length`, ou
 * seja, o que foi PREENCHIDO sobrescrevia o que foi PLANEJADO. Um dia registrado
 * incompleto rebaixava o plano do exercício para sempre. Confirmado nos dados: os
 * registros dele têm `planned_mini_sets: 2` com `mini_reps: [10]` — um só valor.
 */
describe('normalizeMiniSets', () => {
  it('o piso do método é 2 — a definição, não uma preferência', () => {
    // Valor LITERAL de propósito. Escrever `toBe(MIN_MINI_SETS)` nos testes abaixo
    // os tornaria tautológicos: baixar a constante para 1 mudaria a expectativa
    // junto e o guard passaria com o bug presente (verificado por mutação).
    expect(MIN_MINI_SETS).toBe(2)
  })

  it('respeita quantidades válidas', () => {
    expect(normalizeMiniSets(2)).toBe(2)
    expect(normalizeMiniSets(3)).toBe(3)
    expect(normalizeMiniSets(5)).toBe(5)
  })

  it('eleva 1 ao piso do método — o caso exato do print', () => {
    expect(normalizeMiniSets(1)).toBe(2)
  })

  it('trata ausência e lixo como piso, em vez de deixar o card vazio', () => {
    for (const bad of [0, -3, null, undefined, NaN, '', 'abc', {}, []]) {
      expect(normalizeMiniSets(bad), String(bad)).toBe(2)
    }
  })

  it('trunca fracionário para baixo, sem furar o piso', () => {
    expect(normalizeMiniSets(3.9)).toBe(3)
    expect(normalizeMiniSets(2.9)).toBe(2)
    expect(normalizeMiniSets(1.9)).toBe(2)
  })

  it('o piso e o default do editor concordam', () => {
    // Se divergirem, o card mostra uma quantidade e o plano diz outra.
    expect(DEFAULT_MINI_SETS).toBeGreaterThanOrEqual(MIN_MINI_SETS)
  })
})

describe('resolvePlannedMiniSets — o plano não é rebaixado pelo registro', () => {
  it('registrar MENOS minis do que o plano não muda o plano', () => {
    // O bug: plano 2, usuário registra 1, plano vira 1 — e nunca mais volta.
    expect(resolvePlannedMiniSets(2, 1)).toBe(2)
    expect(resolvePlannedMiniSets(3, 1)).toBe(3)
    expect(resolvePlannedMiniSets(4, 2)).toBe(4)
  })

  it('registrar MAIS minis do que o plano promove o plano', () => {
    // Aqui a intenção é clara: a pessoa gerou e preencheu minis a mais.
    expect(resolvePlannedMiniSets(2, 4)).toBe(4)
  })

  it('plano ausente ou inválido cai no piso, nunca em 1', () => {
    expect(resolvePlannedMiniSets(null, 1)).toBe(2)
    expect(resolvePlannedMiniSets(1, 1)).toBe(2)
    expect(resolvePlannedMiniSets(undefined, 3)).toBe(3)
  })

  it('preenchimento inválido não corrompe o plano', () => {
    expect(resolvePlannedMiniSets(3, NaN)).toBe(3)
    expect(resolvePlannedMiniSets(3, null)).toBe(3)
  })
})

describe('os pontos de escrita usam a regra', () => {
  /**
   * Source-guards: exercitar o modal e o saver exigiria montar sessão, providers e
   * contexto de treino. O que precisa ficar travado é que NENHUM caminho volte a
   * gravar a contagem preenchida como plano.
   */
  it('o saver não grava mais `planned_mini_sets: miniReps.length`', () => {
    const src = readFileSync('src/components/workout/hooks/useWorkoutMethodSavers.ts', 'utf8')
    expect(src, 'o registro voltou a sobrescrever o plano').not.toMatch(/planned_mini_sets:\s*miniReps\.length/)
    expect(src).toMatch(/planned_mini_sets:\s*resolvePlannedMiniSets\(/)
  })

  it('o saver recusa salvar abaixo do piso', () => {
    const src = readFileSync('src/components/workout/hooks/useWorkoutMethodSavers.ts', 'utf8')
    expect(src).toMatch(/minis\.length\s*<\s*MIN_MINI_SETS/)
  })

  it('o card normaliza a quantidade vinda de qualquer fonte', () => {
    const src = readFileSync('src/components/workout/set-renderers/restPauseSet.tsx', 'utf8')
    expect(src).toMatch(/const miniSets = normalizeMiniSets\(/)
  })

  it('o botão "Gerar minis" respeita o piso', () => {
    const src = readFileSync('src/components/workout/ModalsComplexMethods.tsx', 'utf8')
    expect(src).toMatch(/normalizeMiniSets\(raw\)/)
  })
})
