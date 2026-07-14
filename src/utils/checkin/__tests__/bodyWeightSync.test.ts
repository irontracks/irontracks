import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseCheckinWeightKg, shouldSyncProfileWeight } from '@/utils/checkin/bodyWeightSync'

describe('parseCheckinWeightKg', () => {
  it('aceita vírgula decimal (o app é pt-BR)', () => {
    expect(parseCheckinWeightKg('97,8')).toBe(97.8)
    expect(parseCheckinWeightKg('97.8')).toBe(97.8)
    expect(parseCheckinWeightKg(97.84)).toBe(97.8) // 1 casa
  })

  it('rejeita valor fora da faixa ou inválido (fail-closed)', () => {
    expect(parseCheckinWeightKg('')).toBeNull()
    expect(parseCheckinWeightKg(null)).toBeNull()
    expect(parseCheckinWeightKg('abc')).toBeNull()
    expect(parseCheckinWeightKg('19')).toBeNull()   // < 20
    expect(parseCheckinWeightKg('301')).toBeNull()  // > 300
  })
})

describe('shouldSyncProfileWeight — só grava quando muda de verdade', () => {
  it('grava quando o peso mudou', () => {
    expect(shouldSyncProfileWeight(97.8, 96.85)).toBe(true)
  })

  it('NÃO grava quando o usuário só confirmou o valor pré-preenchido', () => {
    // O campo vem pré-preenchido com o peso do perfil: a maioria dos check-ins
    // confirma o mesmo número. Sem esta guarda, todo treino escreveria em
    // user_settings à toa.
    expect(shouldSyncProfileWeight(96.9, 96.9)).toBe(false)
    expect(shouldSyncProfileWeight(96.9, 96.92)).toBe(false) // ruído < 0.05
  })

  it('grava quando o perfil ainda não tem peso', () => {
    expect(shouldSyncProfileWeight(80, null)).toBe(true)
    expect(shouldSyncProfileWeight(80, 0)).toBe(true)
    expect(shouldSyncProfileWeight(80, undefined)).toBe(true)
  })

  it('nunca grava peso inválido', () => {
    expect(shouldSyncProfileWeight(null, 96.85)).toBe(false)
  })

  it('diferença de 0.1 kg (a menor possível no campo) sincroniza', () => {
    expect(shouldSyncProfileWeight(96.9, 96.8)).toBe(true)
  })
})

describe('o check-in NÃO pode virar linha na tabela de avaliações (guard)', () => {
  it('useWorkoutCrud não escreve em `assessments`', () => {
    // O card PESO e o gráfico das Avaliações comparam as DUAS ÚLTIMAS linhas da
    // tabela, sem filtrar assessment_type (useAssessmentHistoryData.ts:545). Uma
    // linha por treino viraria "última avaliação" e zeraria o delta de % gordura
    // e massa magra — além de a IA e o relatório público lerem um check-in como
    // avaliação real.
    const src = readFileSync(resolve(process.cwd(), 'src/hooks/useWorkoutCrud.ts'), 'utf8')
    expect(src).not.toContain("from('assessments')")
  })

  it('o peso do check-in é sincronizado com o perfil', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/hooks/useWorkoutCrud.ts'), 'utf8')
    expect(src).toContain('shouldSyncProfileWeight')
    expect(src).toContain('bodyWeightKg: checkinWeight')
  })
})
