import { describe, it, expect } from 'vitest'
import { getCardioSummary, isCardioExercise } from '@/utils/report/cardioSummary'

describe('getCardioSummary', () => {
  it('cardio moderno: tempo de durationSeconds, velocidade/inclinação do log', () => {
    const ex = { name: 'Esteira', type: 'cardio' }
    const log = { done: true, durationSeconds: 1200, speed: '9', incline: '3', reps: null }
    const s = getCardioSummary(ex, log)
    expect(s.timeMin).toBe(20) // 1200s = 20 min
    expect(s.speedKmh).toBe('9')
    expect(s.inclinePct).toBe('3')
  })

  it('cardio legado: tempo vem do campo reps (que guardava minutos), sem cadence', () => {
    // Caso do print: esteira com reps=20 (na verdade 20 min) e cadence="2020" (lixo).
    const ex = { name: 'Esteira', cadence: '2020' }
    const log = { done: true, reps: '20' }
    const s = getCardioSummary(ex, log)
    expect(s.timeMin).toBe(20)
    // o resumo de cardio nem olha cadence — o "Cad: 2020" some
    expect(s).not.toHaveProperty('cadence')
  })

  it('pega velocidade/inclinação do advanced_config quando não estão no log', () => {
    const ex = { name: 'Bicicleta', type: 'cardio', setDetails: [{ advanced_config: { speed: '25', resistance: '8' } }] }
    const log = { done: true, durationSeconds: 900 }
    const s = getCardioSummary(ex, log)
    expect(s.timeMin).toBe(15)
    expect(s.speedKmh).toBe('25')
    expect(s.resistance).toBe('8')
  })

  it('extrai config de HIT', () => {
    const ex = { name: 'Escada', type: 'cardio', setDetails: [{ advanced_config: { isHIT: true, workSec: 30, restSec: 15, rounds: 8 } }] }
    const s = getCardioSummary(ex, { done: true, durationSeconds: 600 })
    expect(s.isHIT).toBe(true)
    expect(s.hitWorkSec).toBe(30)
    expect(s.hitRestSec).toBe(15)
    expect(s.hitRounds).toBe(8)
  })

  it('sem dado nenhum retorna tempo null (card mostra "Cardio concluído")', () => {
    const s = getCardioSummary({ name: 'Esteira' }, { done: true })
    expect(s.timeMin).toBeNull()
    expect(s.speedKmh).toBeNull()
  })

  it('esteira é reconhecida como cardio (pelo nome)', () => {
    expect(isCardioExercise({ name: 'Esteira' })).toBe(true)
    expect(isCardioExercise({ name: 'Supino reto' })).toBe(false)
  })
})
