import { describe, it, expect } from 'vitest'
import {
  MET_LIGHT,
  MET_MODERATE,
  MET_VIGOROUS,
  MET_VERY_VIGOROUS,
  MET_REST,
  DEFAULT_BODY_WEIGHT_KG,
  selectBaseMet,
  detectTrainingStyle,
  getStyleFactor,
  getExerciseComplexityFactor,
  getBodyweightFraction,
  getRpeMultiplier,
  getSexMultiplier,
  getCadenceFactor,
  getEpocFactor,
  computeActiveWorkMinutes,
  estimateDurationFromLogs,
  estimateCaloriesMet,
} from '@/utils/calories/metEstimate'

// ────────────────────────────────────────────────────────────────────────────
// Constantes MET
// ────────────────────────────────────────────────────────────────────────────

describe('Constantes MET (Compendium of Physical Activities 2011)', () => {
  it('MET_LIGHT = 3.5', () => expect(MET_LIGHT).toBe(3.5))
  it('MET_MODERATE = 5.0', () => expect(MET_MODERATE).toBe(5.0))
  it('MET_VIGOROUS = 6.0', () => expect(MET_VIGOROUS).toBe(6.0))
  it('MET_VERY_VIGOROUS = 7.5', () => expect(MET_VERY_VIGOROUS).toBe(7.5))
  it('MET_REST = 1.5', () => expect(MET_REST).toBe(1.5))
  it('DEFAULT_BODY_WEIGHT_KG = 78', () => expect(DEFAULT_BODY_WEIGHT_KG).toBe(78))
})

// ────────────────────────────────────────────────────────────────────────────
// selectBaseMet
// ────────────────────────────────────────────────────────────────────────────

describe('selectBaseMet', () => {
  it('densidade < 60 kg/min → MET_LIGHT', () => {
    // 300 kg em 10 min = 30 kg/min
    expect(selectBaseMet(300, 10)).toBe(MET_LIGHT)
  })

  it('densidade 60–199 kg/min → MET_MODERATE', () => {
    // 1000 kg em 10 min = 100 kg/min
    expect(selectBaseMet(1000, 10)).toBe(MET_MODERATE)
  })

  it('densidade 200–499 kg/min → MET_VIGOROUS', () => {
    // 3000 kg em 10 min = 300 kg/min
    expect(selectBaseMet(3000, 10)).toBe(MET_VIGOROUS)
  })

  it('densidade ≥ 500 kg/min → MET_VERY_VIGOROUS', () => {
    // 6000 kg em 10 min = 600 kg/min
    expect(selectBaseMet(6000, 10)).toBe(MET_VERY_VIGOROUS)
  })

  it('activeMinutes = 0 retorna MET_MODERATE (fallback)', () => {
    expect(selectBaseMet(5000, 0)).toBe(MET_MODERATE)
  })

  it('no limite exato de 60 kg/min retorna MET_MODERATE', () => {
    // 600 kg em 10 min = 60 kg/min (não < 60, cai em MODERATE)
    expect(selectBaseMet(600, 10)).toBe(MET_MODERATE)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// detectTrainingStyle
// ────────────────────────────────────────────────────────────────────────────

describe('detectTrainingStyle', () => {
  it('logs vazios → hypertrophy (default)', () => {
    expect(detectTrainingStyle({})).toBe('hypertrophy')
  })

  it('sets sem dados válidos → hypertrophy', () => {
    const logs = { '0-0': { weight: '', reps: '' } }
    expect(detectTrainingStyle(logs)).toBe('hypertrophy')
  })

  it('avgReps ≤ 5 e peso médio > 60 → strength', () => {
    const logs = {
      '0-0': { weight: '100', reps: '3', restSeconds: 180 },
      '0-1': { weight: '100', reps: '4', restSeconds: 180 },
      '0-2': { weight: '100', reps: '3', restSeconds: 180 },
    }
    expect(detectTrainingStyle(logs)).toBe('strength')
  })

  it('avgReps ≥ 15 → endurance', () => {
    const logs = {
      '0-0': { weight: '20', reps: '20', restSeconds: 60 },
      '0-1': { weight: '20', reps: '15', restSeconds: 60 },
      '0-2': { weight: '20', reps: '18', restSeconds: 60 },
    }
    expect(detectTrainingStyle(logs)).toBe('endurance')
  })

  it('descanso médio < 30s → circuit', () => {
    const logs = {
      '0-0': { weight: '40', reps: '12', restSeconds: 20 },
      '0-1': { weight: '40', reps: '12', restSeconds: 25 },
    }
    expect(detectTrainingStyle(logs)).toBe('circuit')
  })

  it('exercise com method "circuit" → circuit', () => {
    const logs = { '0-0': { weight: '50', reps: '10', restSeconds: 90 } }
    const exercises = [{ method: 'circuit' }]
    expect(detectTrainingStyle(logs, exercises)).toBe('circuit')
  })

  it('exercise com method "hiit" → circuit', () => {
    const logs = { '0-0': { weight: '30', reps: '12', restSeconds: 90 } }
    const exercises = [{ method: 'HIIT' }]
    expect(detectTrainingStyle(logs, exercises)).toBe('circuit')
  })

  it('reps médio 8–12, descanso normal → hypertrophy', () => {
    const logs = {
      '0-0': { weight: '60', reps: '10', restSeconds: 90 },
      '0-1': { weight: '60', reps: '8', restSeconds: 90 },
      '0-2': { weight: '60', reps: '12', restSeconds: 90 },
    }
    expect(detectTrainingStyle(logs)).toBe('hypertrophy')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// getStyleFactor
// ────────────────────────────────────────────────────────────────────────────

describe('getStyleFactor', () => {
  it('circuit → 1.10', () => expect(getStyleFactor('circuit')).toBe(1.10))
  it('strength → 1.00', () => expect(getStyleFactor('strength')).toBe(1.00))
  it('endurance → 1.05', () => expect(getStyleFactor('endurance')).toBe(1.05))
  it('hypertrophy → 1.00', () => expect(getStyleFactor('hypertrophy')).toBe(1.00))
})

// ────────────────────────────────────────────────────────────────────────────
// getExerciseComplexityFactor
// ────────────────────────────────────────────────────────────────────────────

describe('getExerciseComplexityFactor', () => {
  describe('exercícios olímpicos / deadlift (1.15)', () => {
    it('deadlift → 1.15', () => expect(getExerciseComplexityFactor('deadlift')).toBe(1.15))
    it('levantamento terra → 1.15', () => expect(getExerciseComplexityFactor('levantamento terra')).toBe(1.15))
    it('clean → 1.15', () => expect(getExerciseComplexityFactor('clean')).toBe(1.15))
    it('snatch → 1.15', () => expect(getExerciseComplexityFactor('snatch')).toBe(1.15))
  })

  describe('agachamento livre (1.12)', () => {
    it('agachamento → 1.12', () => expect(getExerciseComplexityFactor('agachamento')).toBe(1.12))
    it('back squat → 1.12', () => expect(getExerciseComplexityFactor('back squat')).toBe(1.12))
    it('front squat → 1.12', () => expect(getExerciseComplexityFactor('front squat')).toBe(1.12))
  })

  describe('compostos pull / hip (1.10)', () => {
    it('remada curvada → 1.10', () => expect(getExerciseComplexityFactor('remada curvada')).toBe(1.10))
    it('barra fixa → 1.10', () => expect(getExerciseComplexityFactor('barra fixa')).toBe(1.10))
    it('pull-up → 1.10', () => expect(getExerciseComplexityFactor('pull-up')).toBe(1.10))
    it('hip thrust → 1.10', () => expect(getExerciseComplexityFactor('hip thrust')).toBe(1.10))
  })

  describe('supino livre (1.05)', () => {
    it('supino → 1.05', () => expect(getExerciseComplexityFactor('supino')).toBe(1.05))
    it('bench press → 1.05', () => expect(getExerciseComplexityFactor('bench press')).toBe(1.05))
    it('passada → 1.05', () => expect(getExerciseComplexityFactor('passada')).toBe(1.05))
  })

  describe('leg press (1.02)', () => {
    it('leg press → 1.02', () => expect(getExerciseComplexityFactor('leg press')).toBe(1.02))
  })

  describe('isolação membros inferiores (0.98)', () => {
    it('cadeira extensora → 0.98', () => expect(getExerciseComplexityFactor('cadeira extensora')).toBe(0.98))
    it('mesa flexora → 0.98', () => expect(getExerciseComplexityFactor('mesa flexora')).toBe(0.98))
  })

  describe('isolação braços / cabos (0.92)', () => {
    it('rosca bíceps → 0.92', () => expect(getExerciseComplexityFactor('rosca bíceps')).toBe(0.92))
    it('curl → 0.92', () => expect(getExerciseComplexityFactor('curl')).toBe(0.92))
    it('elevação lateral → 0.92', () => expect(getExerciseComplexityFactor('elevação lateral')).toBe(0.92))
  })

  describe('cabos guiados (0.88)', () => {
    it('peck deck → 0.88', () => expect(getExerciseComplexityFactor('peck deck')).toBe(0.88))
    it('crossover → 0.88', () => expect(getExerciseComplexityFactor('crossover')).toBe(0.88))
    it('pushdown → 0.88', () => expect(getExerciseComplexityFactor('pushdown')).toBe(0.88))
  })

  describe('exercício desconhecido', () => {
    it('exercício sem match retorna 1.00 (default)', () => {
      expect(getExerciseComplexityFactor('exercicio_desconhecido_xyz')).toBe(1.00)
    })
    it('string vazia retorna 1.00', () => {
      expect(getExerciseComplexityFactor('')).toBe(1.00)
    })
  })
})

// ────────────────────────────────────────────────────────────────────────────
// getBodyweightFraction
// ────────────────────────────────────────────────────────────────────────────

describe('getBodyweightFraction', () => {
  it('barra fixa → 1.00 (suspensão total)', () => expect(getBodyweightFraction('barra fixa')).toBe(1.00))
  it('pull-up → 1.00', () => expect(getBodyweightFraction('pull-up')).toBe(1.00))
  it('chin-up → 1.00', () => expect(getBodyweightFraction('chin-up')).toBe(1.00))
  it('muscle-up → 1.00', () => expect(getBodyweightFraction('muscle-up')).toBe(1.00))
  it('mergulho → 0.90 (dip)', () => expect(getBodyweightFraction('mergulho')).toBe(0.90))
  it('paralelas → 0.90', () => expect(getBodyweightFraction('paralelas')).toBe(0.90))
  it('pistol squat → 0.85', () => expect(getBodyweightFraction('pistol squat')).toBe(0.85))
  it('burpee → 0.70', () => expect(getBodyweightFraction('burpee')).toBe(0.70))
  it('flexão → 0.65 (push-up)', () => expect(getBodyweightFraction('flexão')).toBe(0.65))
  it('push-up → 0.65', () => expect(getBodyweightFraction('push-up')).toBe(0.65))
  it('australiana → 0.60 (inverted row)', () => expect(getBodyweightFraction('australiana')).toBe(0.60))
  it('exercício com peso externo → 0 (sem ajuste)', () => expect(getBodyweightFraction('supino')).toBe(0))
  it('string vazia → 0', () => expect(getBodyweightFraction('')).toBe(0))
})

// ────────────────────────────────────────────────────────────────────────────
// getRpeMultiplier
// ────────────────────────────────────────────────────────────────────────────

describe('getRpeMultiplier', () => {
  it('null → 1.00 (neutro)', () => expect(getRpeMultiplier(null)).toBe(1.00))
  it('undefined → 1.00', () => expect(getRpeMultiplier(undefined)).toBe(1.00))
  it('NaN → 1.00', () => expect(getRpeMultiplier(NaN)).toBe(1.00))
  it('RPE 1 (muito leve) → 0.85', () => expect(getRpeMultiplier(1)).toBe(0.85))
  it('RPE 3 → 0.85', () => expect(getRpeMultiplier(3)).toBe(0.85))
  it('RPE 4 → 0.88', () => expect(getRpeMultiplier(4)).toBe(0.88))
  it('RPE 5 → 0.92', () => expect(getRpeMultiplier(5)).toBe(0.92))
  it('RPE 6 → 0.96', () => expect(getRpeMultiplier(6)).toBe(0.96))
  it('RPE 7 → 1.00 (baseline)', () => expect(getRpeMultiplier(7)).toBe(1.00))
  it('RPE 8 → 1.00', () => expect(getRpeMultiplier(8)).toBe(1.00))
  it('RPE 9 → 1.04', () => expect(getRpeMultiplier(9)).toBe(1.04))
  it('RPE 10 (máximo) → 1.08', () => expect(getRpeMultiplier(10)).toBe(1.08))
  it('RPE > 10 clampado → 1.08', () => expect(getRpeMultiplier(15)).toBe(1.08))
  it('RPE < 1 clampado → 0.85', () => expect(getRpeMultiplier(-5)).toBe(0.85))
})

// ────────────────────────────────────────────────────────────────────────────
// getSexMultiplier
// ────────────────────────────────────────────────────────────────────────────

describe('getSexMultiplier', () => {
  it('female → 0.90', () => expect(getSexMultiplier('female')).toBe(0.90))
  it('male → 1.00', () => expect(getSexMultiplier('male')).toBe(1.00))
  it('null → 1.00', () => expect(getSexMultiplier(null)).toBe(1.00))
  it('undefined → 1.00', () => expect(getSexMultiplier(undefined)).toBe(1.00))
  it('string desconhecida → 1.00', () => expect(getSexMultiplier('other')).toBe(1.00))
})

// ────────────────────────────────────────────────────────────────────────────
// getCadenceFactor
// ────────────────────────────────────────────────────────────────────────────

describe('getCadenceFactor', () => {
  it('null → 1.00', () => expect(getCadenceFactor(null)).toBe(1.00))
  it('undefined → 1.00', () => expect(getCadenceFactor(undefined)).toBe(1.00))
  it('array vazio → 1.00', () => expect(getCadenceFactor([])).toBe(1.00))

  it('cadência rápida "2-0-1" (soma 3, < 4) → 1.05', () => {
    expect(getCadenceFactor(['2-0-1'])).toBe(1.05)
  })

  it('cadência normal "3-0-2" (soma 5, 4–7) → 1.00', () => {
    expect(getCadenceFactor(['3-0-2'])).toBe(1.00)
  })

  it('cadência lenta "4-1-4" (soma 9, > 7) → 0.95', () => {
    expect(getCadenceFactor(['4-1-4'])).toBe(0.95)
  })

  it('formato 4 dígitos "3030" (soma 6) → 1.00', () => {
    expect(getCadenceFactor(['3030'])).toBe(1.00)
  })

  it('"X-0-X" (soma 2, explosivo) → 1.05', () => {
    expect(getCadenceFactor(['X-0-X'])).toBe(1.05)
  })

  it('média de múltiplas cadências é calculada corretamente', () => {
    // "2-0-1" (soma 3) + "4-1-4" (soma 9) → média 6 → 1.00
    expect(getCadenceFactor(['2-0-1', '4-1-4'])).toBe(1.00)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// getEpocFactor
// ────────────────────────────────────────────────────────────────────────────

describe('getEpocFactor', () => {
  it('MET < 5, qualquer duração → 1.00 (sem EPOC)', () => {
    expect(getEpocFactor(3.5, 90)).toBe(1.00)
  })

  it('MET ≥ 5.0 e duração ≤ 45 min → 1.00', () => {
    expect(getEpocFactor(5.0, 45)).toBe(1.00)
  })

  it('MET ≥ 5.0 e duração > 45 min → 1.03', () => {
    expect(getEpocFactor(5.0, 46)).toBe(1.03)
  })

  it('MET ≥ 6.0 e duração > 60 min → 1.05', () => {
    expect(getEpocFactor(6.0, 61)).toBe(1.05)
  })

  it('MET ≥ 7.0 e duração > 60 min → 1.07', () => {
    expect(getEpocFactor(7.0, 61)).toBe(1.07)
  })

  it('MET 7.5 (MET_VERY_VIGOROUS) e 90 min → 1.07', () => {
    expect(getEpocFactor(MET_VERY_VIGOROUS, 90)).toBe(1.07)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// computeActiveWorkMinutes
// ────────────────────────────────────────────────────────────────────────────

describe('computeActiveWorkMinutes', () => {
  it('totalMinutes = 0 → retorna 0', () => {
    expect(computeActiveWorkMinutes({}, 0)).toBe(0)
  })

  it('totalMinutes negativo → retorna 0', () => {
    expect(computeActiveWorkMinutes({}, -10)).toBe(0)
  })

  it('logs vazios → sem repouso, active = total = 60 (clampado por 40%)', () => {
    // Sem exec e sem rest: active = totalMinutes - 0 = 60; max(60, 60*0.40) = 60
    const result = computeActiveWorkMinutes({}, 60)
    expect(result).toBe(60)
  })

  it('usa executionSeconds quando disponível e > 60s (soma total)', () => {
    // Guard da função: exec < 600 por set. Usando 450s por set.
    // 8 sets × 450s = 3600s total = 60 min > totalMinutes
    // Cada set: 450s < 600s (passa o guard)
    const logs: Record<string, unknown> = {
      '0-0': { executionSeconds: 450 }, // 7.5 min por set
      '0-1': { executionSeconds: 450 },
      '0-2': { executionSeconds: 450 },
      '0-3': { executionSeconds: 450 },
    }
    const result = computeActiveWorkMinutes(logs, 60)
    // totalExecSeconds = 1800s > 60 → max(1800/60, 60*0.35) = max(30, 21) = 30
    expect(result).toBe(30)
  })

  it('clamp: resultado nunca abaixo de 35% do total quando usa execução', () => {
    // executionSeconds total = 90s (≤ 60s não → na verdade 90 > 60 → usa ramo direto)
    // max(90/60, 60*0.35) = max(1.5, 21) = 21
    const logs: Record<string, unknown> = {
      '0-0': { executionSeconds: 90 },
    }
    const result = computeActiveWorkMinutes(logs, 60)
    expect(result).toBeGreaterThanOrEqual(60 * 0.35)
  })

  it('sem executionSeconds mas com restSeconds válidos (< 600s): subtrai do total', () => {
    // restSeconds de 300s (5 min) cada, dentro do limite < 600
    const logs: Record<string, unknown> = {
      '0-0': { restSeconds: 300 }, // 5 min
      '0-1': { restSeconds: 300 }, // +5 min = 10 min repouso total
    }
    const result = computeActiveWorkMinutes(logs, 60)
    // active = 60 - 10 = 50; max(50, 60*0.40) = max(50, 24) = 50
    expect(result).toBe(50)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// estimateDurationFromLogs
// ────────────────────────────────────────────────────────────────────────────

describe('estimateDurationFromLogs', () => {
  const NOW_MS = 1_700_000_000_000

  it('logs vazios → null', () => {
    expect(estimateDurationFromLogs({})).toBeNull()
  })

  it('apenas 1 timestamp → null (precisa de ≥ 2)', () => {
    const logs = { '0-0': { completedAtMs: NOW_MS } }
    expect(estimateDurationFromLogs(logs)).toBeNull()
  })

  it('calcula duração a partir de timestamps mín e máx', () => {
    const start = NOW_MS
    const end = NOW_MS + 60 * 60_000 // +60 minutos
    const logs = {
      '0-0': { completedAtMs: start },
      '0-1': { completedAtMs: end },
    }
    const result = estimateDurationFromLogs(logs)
    expect(result).toBe(60)
  })

  it('usa startedAtMs quando anterior ao primeiro log', () => {
    const startedAt = NOW_MS - 5 * 60_000 // 5 min antes
    const end = NOW_MS + 60 * 60_000 // 60 min após NOW_MS
    const logs = {
      '0-0': { completedAtMs: NOW_MS },
      '0-1': { completedAtMs: end },
    }
    const result = estimateDurationFromLogs(logs, startedAt)
    // (end - startedAt) / 60_000 = (60 + 5) = 65 min
    expect(result).toBe(65)
  })

  it('duração < 5 min → null (sessão inválida)', () => {
    const logs = {
      '0-0': { completedAtMs: NOW_MS },
      '0-1': { completedAtMs: NOW_MS + 2 * 60_000 }, // 2 min
    }
    expect(estimateDurationFromLogs(logs)).toBeNull()
  })

  it('duração > 240 min → null (sessão inválida)', () => {
    const logs = {
      '0-0': { completedAtMs: NOW_MS },
      '0-1': { completedAtMs: NOW_MS + 300 * 60_000 }, // 300 min
    }
    expect(estimateDurationFromLogs(logs)).toBeNull()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// estimateCaloriesMet — função principal
// ────────────────────────────────────────────────────────────────────────────

describe('estimateCaloriesMet', () => {
  describe('edge cases', () => {
    it('duração 0 e sem logs de timestamp → retorna 0', () => {
      const result = estimateCaloriesMet({}, 0)
      expect(result).toBe(0)
    })

    it('logs vazios, 60 min → valor positivo com peso padrão', () => {
      const result = estimateCaloriesMet({}, 60)
      expect(result).toBeGreaterThan(0)
    })

    it('peso 0 → usa DEFAULT_BODY_WEIGHT_KG', () => {
      const resultDefault = estimateCaloriesMet({}, 60, null)
      const resultZero = estimateCaloriesMet({}, 60, 0)
      expect(resultDefault).toBe(resultZero)
    })

    it('peso fora do range (< 20 kg) → usa DEFAULT_BODY_WEIGHT_KG', () => {
      const resultDefault = estimateCaloriesMet({}, 60, null)
      const resultInvalid = estimateCaloriesMet({}, 60, 10)
      expect(resultDefault).toBe(resultInvalid)
    })

    it('peso fora do range (> 300 kg) → usa DEFAULT_BODY_WEIGHT_KG', () => {
      const resultDefault = estimateCaloriesMet({}, 60, null)
      const resultInvalid = estimateCaloriesMet({}, 60, 400)
      expect(resultDefault).toBe(resultInvalid)
    })
  })

  describe('efeito do peso corporal', () => {
    it('pessoa mais pesada queima mais calorias', () => {
      const light = estimateCaloriesMet({}, 60, 60)
      const heavy = estimateCaloriesMet({}, 60, 100)
      expect(heavy).toBeGreaterThan(light)
    })
  })

  describe('efeito do sexo biológico', () => {
    it('mulher queima ~10% menos que homem (mesmo treino)', () => {
      const male = estimateCaloriesMet({}, 60, 70, null, null, null, null, 'male')
      const female = estimateCaloriesMet({}, 60, 70, null, null, null, null, 'female')
      expect(female).toBeLessThan(male)
      // Diferença deve ser próxima de 10% (fatores EPOC podem causar pequena variação)
      expect(female / male).toBeCloseTo(0.90, 1)
    })
  })

  describe('efeito do RPE', () => {
    it('RPE 10 resulta em mais calorias que RPE 5', () => {
      const low = estimateCaloriesMet({}, 60, 80, null, 5)
      const high = estimateCaloriesMet({}, 60, 80, null, 10)
      expect(high).toBeGreaterThan(low)
    })
  })

  describe('cálculo com inputs reais', () => {
    it('sessão de 60 min, 80 kg, treino moderado → 200–600 kcal', () => {
      const logs: Record<string, unknown> = {
        '0-0': { weight: '80', reps: '10', restSeconds: 90 },
        '0-1': { weight: '80', reps: '10', restSeconds: 90 },
        '1-0': { weight: '60', reps: '12', restSeconds: 60 },
        '1-1': { weight: '60', reps: '12', restSeconds: 60 },
      }
      const result = estimateCaloriesMet(logs, 60, 80)
      expect(result).toBeGreaterThanOrEqual(200)
      expect(result).toBeLessThanOrEqual(600)
    })

    it('sessão pesada de 90 min, 90 kg → 350–750 kcal', () => {
      const logs: Record<string, unknown> = {
        '0-0': { weight: '130', reps: '5', restSeconds: 180 },
        '0-1': { weight: '130', reps: '5', restSeconds: 180 },
        '0-2': { weight: '130', reps: '5', restSeconds: 180 },
        '1-0': { weight: '100', reps: '8', restSeconds: 120 },
        '1-1': { weight: '100', reps: '8', restSeconds: 120 },
      }
      const result = estimateCaloriesMet(
        logs,
        90,
        90,
        ['agachamento', 'supino'],
        8,
      )
      expect(result).toBeGreaterThanOrEqual(350)
      expect(result).toBeLessThanOrEqual(750)
    })
  })

  describe('exercícios bodyweight sem peso', () => {
    it('pull-ups sem peso usa peso corporal como volume equivalente', () => {
      const logsWithWeight = estimateCaloriesMet(
        { '0-0': { weight: '78', reps: '10' } },
        40,
        78,
        ['supino'],
      )
      const logsBodyweight = estimateCaloriesMet(
        { '0-0': { weight: '0', reps: '10' } },
        40,
        78,
        ['barra fixa'],
      )
      // Barra fixa usa 100% do peso corporal, resultado deve ser positivo
      expect(logsBodyweight).toBeGreaterThan(0)
      // Calorias com barra fixa devem ser comparáveis ao supino com mesmo volume
      expect(logsBodyweight).toBeGreaterThan(logsWithWeight * 0.5)
    })
  })

  describe('resultado sempre é inteiro positivo', () => {
    it('retorna número inteiro', () => {
      const result = estimateCaloriesMet({}, 45, 75)
      expect(Number.isInteger(result)).toBe(true)
    })

    it('retorna 0 para inputs inválidos', () => {
      expect(estimateCaloriesMet({}, -1)).toBe(0)
    })
  })

  describe('buraco temporal — descanso absorve o tempo residual (item 4)', () => {
    it('descanso reportado baixo não deixa tempo sem contar calorias', () => {
      const logs: Record<string, unknown> = {
        '0-0': { weight: '80', reps: '10', done: true },
        '0-1': { weight: '80', reps: '10', done: true },
        '0-2': { weight: '80', reps: '10', done: true },
      }
      // Sessão de 90 min, execução reportada = 10 min (ativo trava em 40% = 36 min).
      // Descanso residual = 90 − 36 = 54 min. Com o fix, tanto rest=10 quanto rest=50
      // são absorvidos pelos 54 min residuais → MESMO gasto. Antes, rest travava no
      // valor reportado e deixava um "buraco" (44 de 90 min contando 0 kcal).
      const restBaixo = estimateCaloriesMet(logs, 90, 78, ['supino'], null, 10, 10)
      const restAlto = estimateCaloriesMet(logs, 90, 78, ['supino'], null, 10, 50)
      expect(restBaixo).toBe(restAlto)
      expect(restBaixo).toBeGreaterThan(0)
    })

    it('exec+descanso reportados acima da duração NÃO inflam as calorias', () => {
      const logs: Record<string, unknown> = {
        '0-0': { weight: '80', reps: '10', done: true },
        '0-1': { weight: '80', reps: '10', done: true },
      }
      // Timers do device são independentes: exec 30 + rest 45 = 75 min numa sessão
      // de 60 min (ex.: descanso contado em background no iOS). O gasto não pode
      // passar do caso que cabe certinho (exec 30 + rest 30). Antes, o max() sem teto
      // contava 75 min de trabalho em 60 → calorias infladas.
      const estoura = estimateCaloriesMet(logs, 60, 78, ['supino'], null, 30, 45)
      const cabe = estimateCaloriesMet(logs, 60, 78, ['supino'], null, 30, 30)
      expect(estoura).toBe(cabe)
    })
  })
})
