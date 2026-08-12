/**
 * Guards do prefixo de dia no título (12/08/2026).
 *
 * Sintoma no aparelho: "QUA · Upper A - Costas + O…" no header do treino ativo e
 * quatro títulos cortados no histórico. O que sobrava era sempre o começo — e o
 * começo é a parte redundante, porque nas duas telas o dia já está dito: você
 * está treinando agora, e o card do histórico traz a data completa embaixo.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripDayPrefix } from '../workoutTitle'

describe('stripDayPrefix', () => {
  it('o caso real do aparelho encurta e diz mais', () => {
    expect(stripDayPrefix('QUA · Upper A - Costas + Ombro')).toBe('Upper A - Costas + Ombro')
  })

  it('os sete dias saem, com os separadores que a base usa', () => {
    // Varre a semana inteira: um `SÁB` esquecido só apareceria no sábado.
    const casos = ['SEG · A', 'TER - B', 'QUA – C', 'QUI • D', 'SEX: E', 'SÁB · F', 'DOM · G']
    expect(casos.map(stripDayPrefix)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G'])
  })

  it('SAB sem acento também — os dois existem na base', () => {
    expect(stripDayPrefix('SAB · Cardio')).toBe('Cardio')
  })

  it('título sem prefixo passa intacto', () => {
    expect(stripDayPrefix('Upper A - Costas')).toBe('Upper A - Costas')
    expect(stripDayPrefix('Treino de segunda')).toBe('Treino de segunda')
  })

  it('não come palavra que só COMEÇA com o nome do dia', () => {
    // Sem exigir o separador, "Segunda-feira pesada" viraria "feira pesada".
    expect(stripDayPrefix('Segunda-feira pesada')).toBe('Segunda-feira pesada')
    expect(stripDayPrefix('Domingo livre')).toBe('Domingo livre')
  })

  it('título que é SÓ o dia continua nomeado', () => {
    // Devolver '' deixaria um card sem nome — pior que o prefixo redundante.
    expect(stripDayPrefix('QUA')).toBe('QUA')
    expect(stripDayPrefix('QUA · ')).toBe('QUA ·')
  })

  it('vazio e não-string não quebram', () => {
    expect(stripDayPrefix(null)).toBe('')
    expect(stripDayPrefix(undefined)).toBe('')
    expect(stripDayPrefix(123)).toBe('123')
  })
})

describe('fiação — onde entra e onde NÃO entra', () => {
  const SRC = join(__dirname, '..', '..', '..')
  const ler = (rel: string) => readFileSync(join(SRC, rel), 'utf8')

  it('o header do treino ativo usa', () => {
    expect(ler('components/workout/WorkoutHeader.tsx')).toMatch(/stripDayPrefix\(workout\?\.title\)/)
  })

  it('o card do histórico usa', () => {
    expect(ler('components/HistoryList.tsx')).toMatch(/stripDayPrefix\(t\)/)
  })

  it('a LISTA de treinos do dashboard NÃO usa', () => {
    // Ali o dia é como o usuário escolhe o treino — tirá-lo seria remover a
    // informação principal do card, não a redundante.
    expect(ler('components/dashboard/StudentDashboard.tsx')).not.toMatch(/stripDayPrefix/)
  })
})
