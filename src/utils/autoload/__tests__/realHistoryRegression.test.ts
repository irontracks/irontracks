/**
 * Regressão do autoload com HISTÓRICO REAL dos perfis do beta fechado.
 *
 * Os dois bugs do beta (exercício com carga cujo nome parece peso corporal; unilateral
 * que não preenchia) só apareceram com dados de verdade — o motor sozinho passava em
 * todos os testes sintéticos. Estes casos congelam os logs REAIS que produziram cada
 * bug (extraídos de `workouts.notes`, objeto `logs` chaveado por "exIdx-setIdx") e
 * exercitam o caminho inteiro que o app roda em treino:
 *
 *   log bruto → extractLogWeight/Reps/Rpe (builder do reportHistory)
 *             → HistorySet → inferEquipmentFromName + suggestWeight
 *
 * Se qualquer elo quebrar de novo, o peso volta a `null` e estes testes falham.
 */

import { describe, it, expect } from 'vitest'
import { suggestWeight, type HistorySet } from '../suggestWeight'
import { inferEquipmentFromName } from '../equipmentFromName'
import { extractLogWeight, extractLogReps, extractLogRpe } from '@/components/workout/utils'

type RawLog = Record<string, unknown>

/**
 * Espelha o builder de histórico do `useWorkoutDeload` + o `buildHistorySets` do
 * `useWorkoutAutoload`: lê o log cru da sessão e devolve as séries que o motor recebe.
 */
const toHistory = (logs: RawLog[]): HistorySet[] =>
  logs
    .map((log) => ({
      weight: extractLogWeight(log),
      reps: extractLogReps(log),
      rpe: extractLogRpe(log),
    }))
    .filter(
      (s): s is HistorySet =>
        s.weight != null && s.weight > 0 && s.reps != null && s.reps > 0,
    )

/** Sessão de 23/07/2026 — bilateral, nome "abdominal" (bug #1: virava peso corporal). */
const ABDOMINAL_INFRA_50KG: RawLog[] = [
  { done: true, weight: '50', reps: '12', rpe: '7' },
  { done: true, weight: '50', reps: '12', rpe: '8' },
  { done: true, weight: '50', reps: '12', rpe: '9' },
]

/** Sessão de 13/04/2026 do 2º perfil — mesmo padrão, outro nome/carga. */
const ABDOMINAL_INFRA_SUSPENSO_40KG: RawLog[] = [
  { done: true, weight: '40', reps: '20', rpe: '8' },
  { done: true, weight: '40', reps: '20', rpe: '8' },
  { done: true, weight: '40', reps: '20', rpe: '8' },
  { done: true, weight: '40', reps: '20', rpe: '8' },
]

/** Sessão de 23/07/2026 — UNILATERAL: peso/reps/rpe só existem nos campos por lado. */
const FLEXORA_EM_PE_UNILATERAL: RawLog[] = [
  { done: true, L_weight: '10', R_weight: '10', L_reps: '12', R_reps: '12', L_rpe: '7', R_rpe: '7', L_done: true, R_done: true },
  { done: true, L_weight: '10', R_weight: '10', L_reps: '12', R_reps: '12', L_rpe: '8', R_rpe: '8', L_done: true, R_done: true },
  { done: true, failure: true, L_weight: '12,5', R_weight: '12,5', L_reps: '12', R_reps: '12', L_rpe: '10', R_rpe: '10', L_done: true, R_done: true },
]

/** Sessão de 23/07/2026 do 2º perfil — unilateral com carga menor. */
const FLEXORA_EM_PE_UNILATERAL_8KG: RawLog[] = [
  { done: true, L_weight: '8', R_weight: '8', L_reps: '10', R_reps: '10', L_rpe: '8', R_rpe: '8', L_done: true, R_done: true },
  { done: true, L_weight: '8', R_weight: '8', L_reps: '10', R_reps: '10', L_rpe: '8', R_rpe: '8', L_done: true, R_done: true },
  { done: true, L_weight: '8', R_weight: '8', L_reps: '10', R_reps: '10', L_rpe: '8', R_rpe: '8', L_done: true, R_done: true },
]

describe('autoload — histórico real do beta: exercício com carga e nome de peso corporal', () => {
  it('"Abdominal infra" com 50 kg logados sugere carga (não cai em "progrida por reps")', () => {
    const history = toHistory(ABDOMINAL_INFRA_50KG)
    expect(history).toHaveLength(3)

    const suggestion = suggestWeight({
      history,
      targetReps: 12,
      targetRpe: null,
      equipment: inferEquipmentFromName('Abdominal infra'),
    })

    expect(suggestion.weight).toBe(50)
    expect(suggestion.confidence).toBe('high')
    expect(suggestion.rationale).not.toMatch(/sem carga externa/i)
  })

  it('"Abdominal Infra (Suspenso ou Solo)" com 40 kg logados também sugere carga', () => {
    const suggestion = suggestWeight({
      history: toHistory(ABDOMINAL_INFRA_SUSPENSO_40KG),
      targetReps: 20,
      targetRpe: null,
      equipment: inferEquipmentFromName('Abdominal Infra (Suspenso ou Solo)'),
    })

    expect(suggestion.weight).toBe(40)
  })

  it('exercício de peso corporal SEM carga logada segue progredindo por reps', () => {
    const suggestion = suggestWeight({
      history: [],
      targetReps: 12,
      targetRpe: null,
      equipment: inferEquipmentFromName('Barra fixa'),
    })

    expect(suggestion.weight).toBeNull()
    expect(suggestion.rationale).toMatch(/sem carga externa/i)
  })
})

describe('autoload — histórico real do beta: exercício UNILATERAL', () => {
  it('"Flexora em pé" com peso só por lado (L/R) vira histórico completo', () => {
    const history = toHistory(FLEXORA_EM_PE_UNILATERAL)

    // O builder tem que ler peso, reps E rpe dos lados — sem reps a série é
    // descartada pelo motor e o autoload não preenche nada (bug do beta).
    expect(history).toEqual([
      { weight: 10, reps: 12, rpe: 7 },
      { weight: 10, reps: 12, rpe: 8 },
      { weight: 12.5, reps: 12, rpe: 10 },
    ])
  })

  it('"Flexora em pé" (unilateral) sugere carga para os dois lados', () => {
    const suggestion = suggestWeight({
      history: toHistory(FLEXORA_EM_PE_UNILATERAL),
      targetReps: 12,
      targetRpe: null,
      equipment: inferEquipmentFromName('Flexora em pé'),
    })

    expect(suggestion.weight).not.toBeNull()
    expect(suggestion.confidence).toBe('high')
    // Não regride abaixo da maior carga da última sessão.
    expect(suggestion.weight as number).toBeGreaterThanOrEqual(12.5)
  })

  it('"Flexora em pé" do 2º perfil (8 kg) não regride a carga', () => {
    const suggestion = suggestWeight({
      history: toHistory(FLEXORA_EM_PE_UNILATERAL_8KG),
      targetReps: 10,
      targetRpe: null,
      equipment: inferEquipmentFromName('Flexora em pé'),
    })

    // 8 kg não é múltiplo do passo de 5 kg da máquina, mas o usuário comprovadamente
    // montou 8 kg — arredondar pra baixo (5 kg) seria uma regressão de 37%.
    expect(suggestion.weight).toBe(8)
  })
})
