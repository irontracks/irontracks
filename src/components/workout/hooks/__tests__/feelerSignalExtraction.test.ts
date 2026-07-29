/**
 * Regra do opt-in duplo (decisão do dono, 2026-07-29): a calibração pelo
 * reconhecimento só entra quando a série está marcada como "Reconhecimento" E o RPE
 * foi preenchido. Este arquivo trava exatamente esse portão.
 *
 * Sem ele, o motor passaria a mexer na carga a partir de séries que o usuário não
 * escolheu para isso — e a chavinha global deixaria de ser o único controle do
 * professor sobre o autopreenchimento.
 */
import { describe, it, expect } from 'vitest'
import { extractFeelerSignals } from '../useWorkoutAutoload'

/** Exercício 0 com 4 séries; a 1ª é Reconhecimento pelo TEMPLATE. */
const EXERCISES = [
  {
    name: 'Supino declinado',
    sets: 4,
    setDetails: [{ set_type: 'feeler' }, { set_type: 'working' }, { set_type: 'working' }, { set_type: 'working' }],
  },
]

describe('extractFeelerSignals', () => {
  it('extrai o sinal quando a série é Reconhecimento, está concluída e tem RPE', () => {
    const logs = { '0-0': { weight: '120', reps: '6', rpe: '7', done: true } }
    expect(extractFeelerSignals(EXERCISES, logs)).toEqual({ 0: { weight: 120, reps: 6, rpe: 7 } })
  })

  it('IGNORA sem RPE preenchido (o opt-in do dono)', () => {
    const logs = { '0-0': { weight: '120', reps: '6', done: true } }
    expect(extractFeelerSignals(EXERCISES, logs)).toEqual({})
  })

  it('IGNORA série ainda não concluída', () => {
    const logs = { '0-0': { weight: '120', reps: '6', rpe: '7' } }
    expect(extractFeelerSignals(EXERCISES, logs)).toEqual({})
  })

  it('IGNORA série de trabalho, mesmo completa e com RPE', () => {
    const logs = { '0-1': { weight: '130', reps: '8', rpe: '9', done: true } }
    expect(extractFeelerSignals(EXERCISES, logs)).toEqual({})
  })

  it('IGNORA aquecimento', () => {
    const exs = [{ name: 'X', sets: 2, setDetails: [{ set_type: 'warmup' }, { set_type: 'working' }] }]
    const logs = { '0-0': { weight: '60', reps: '10', rpe: '5', done: true } }
    expect(extractFeelerSignals(exs, logs)).toEqual({})
  })

  it('aceita o tipo vindo do LOG (override da sessão), não só do template', () => {
    const exs = [{ name: 'X', sets: 2, setDetails: [{ set_type: 'working' }, { set_type: 'working' }] }]
    const logs = { '0-0': { set_type: 'feeler', weight: '100', reps: '5', rpe: '6', done: true } }
    expect(extractFeelerSignals(exs, logs)).toEqual({ 0: { weight: 100, reps: 5, rpe: 6 } })
  })

  it('havendo vários reconhecimentos, vence o de MAIOR carga (menor erro de extrapolação)', () => {
    const exs = [{ name: 'X', sets: 3, setDetails: [{ set_type: 'feeler' }, { set_type: 'feeler' }, { set_type: 'working' }] }]
    const logs = {
      '0-0': { weight: '60', reps: '10', rpe: '5', done: true },
      '0-1': { weight: '100', reps: '6', rpe: '7', done: true },
    }
    expect(extractFeelerSignals(exs, logs)).toEqual({ 0: { weight: 100, reps: 6, rpe: 7 } })
  })

  it('separa sinais por exercício', () => {
    const exs = [
      { name: 'A', sets: 1, setDetails: [{ set_type: 'feeler' }] },
      { name: 'B', sets: 1, setDetails: [{ set_type: 'feeler' }] },
    ]
    const logs = {
      '0-0': { weight: '50', reps: '8', rpe: '6', done: true },
      '1-0': { weight: '80', reps: '5', rpe: '8', done: true },
    }
    expect(extractFeelerSignals(exs, logs)).toEqual({
      0: { weight: 50, reps: 8, rpe: 6 },
      1: { weight: 80, reps: 5, rpe: 8 },
    })
  })

  it('aceita done como string "true" (o log passa por JSON em workouts.notes)', () => {
    const logs = { '0-0': { weight: '120', reps: '6', rpe: '7', done: 'true' } }
    expect(extractFeelerSignals(EXERCISES, logs)).toEqual({ 0: { weight: 120, reps: 6, rpe: 7 } })
  })

  it('tolera logs vazios/ausentes sem quebrar', () => {
    expect(extractFeelerSignals(EXERCISES, null)).toEqual({})
    expect(extractFeelerSignals(EXERCISES, {})).toEqual({})
    expect(extractFeelerSignals([], { '0-0': { done: true } })).toEqual({})
  })
})
