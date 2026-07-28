/**
 * Guards da dica de anilhas do autoload.
 *
 * O que importa: a dica é uma INSTRUÇÃO de montagem. Errar a conta (ou mostrá-la
 * num aparelho que não tem anilha) é pior que não mostrar nada — por isso os
 * casos negativos são tão importantes quanto a matemática.
 */
import { describe, it, expect } from 'vitest'
import { planPlatesPerSide, formatPlateLoadout, plateHintForExercise } from '../plateBreakdown'

describe('planPlatesPerSide', () => {
  it('máquina de anilha (sem barra): divide o total em dois lados', () => {
    const l = planPlatesPerSide(325, { barKg: 0 })
    expect(l?.perSide).toEqual([{ plate: 20, count: 8 }, { plate: 2.5, count: 1 }])
    expect(l?.leftoverKg).toBe(0)
  })

  it('barra livre: desconta os 20 kg da barra antes de dividir', () => {
    const l = planPlatesPerSide(100, { barKg: 20 })
    // (100 - 20) / 2 = 40 por lado
    expect(l?.perSide).toEqual([{ plate: 20, count: 2 }])
    expect(l?.leftoverKg).toBe(0)
  })

  it('sobra o que o kit não monta, sem inventar anilha', () => {
    const l = planPlatesPerSide(103, { barKg: 20 })
    // 41,5 por lado → 2×20 + 1×1,25, sobra 0,25
    expect(l?.perSide).toEqual([{ plate: 20, count: 2 }, { plate: 1.25, count: 1 }])
    expect(l?.leftoverKg).toBe(0.25)
    expect(formatPlateLoadout(l)).toBe('≈ 2×20 + 1×1,25 por lado')
  })

  it('peso igual ou menor que a barra não gera montagem', () => {
    expect(planPlatesPerSide(20, { barKg: 20 })).toBeNull()
    expect(planPlatesPerSide(21, { barKg: 20 })).toBeNull() // 0,5 por lado: nem a de 1,25 entra
    expect(planPlatesPerSide(Number.NaN, { barKg: 0 })).toBeNull()
  })

  it('formata com vírgula decimal', () => {
    expect(formatPlateLoadout(planPlatesPerSide(15, { barKg: 0 }))).toBe('1×5 + 1×2,5 por lado')
  })
})

describe('plateHintForExercise', () => {
  it('leg press 45 com 325 kg', () => {
    expect(plateHintForExercise('Leg Press 45°', 325)).toBe('8×20 + 1×2,5 por lado')
  })

  it('agachamento livre (barra implícita) desconta a barra', () => {
    expect(plateHintForExercise('Agachamento livre', 100)).toBe('2×20 por lado')
  })

  it('NÃO mostra em máquina de pino, cabo, halter ou peso corporal', () => {
    expect(plateHintForExercise('Cadeira extensora', 60)).toBeNull()
    expect(plateHintForExercise('Puxada alta na polia', 70)).toBeNull()
    expect(plateHintForExercise('Supino reto com halteres', 40)).toBeNull()
    expect(plateHintForExercise('Barra fixa', 90)).toBeNull()
  })

  it('NÃO mostra no Smith (peso da barra guiada varia por aparelho)', () => {
    expect(plateHintForExercise('Supino no Smith', 100)).toBeNull()
  })

  it('NÃO mostra em exercício carregado numa ponta só', () => {
    expect(plateHintForExercise('Remada cavalinho', 60)).toBeNull()
    expect(plateHintForExercise('Agachamento landmine', 60)).toBeNull()
  })

  it('peso ausente ou zerado não gera dica', () => {
    expect(plateHintForExercise('Leg Press 45°', 0)).toBeNull()
    expect(plateHintForExercise('Leg Press 45°', null)).toBeNull()
    expect(plateHintForExercise('', 100)).toBeNull()
  })
})
