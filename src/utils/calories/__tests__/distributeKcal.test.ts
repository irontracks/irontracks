import { describe, it, expect } from 'vitest'
import { distributeKcalByExercise, distributeKcalWithFixed } from '../distributeKcal'

describe('distributeKcalByExercise', () => {
  it('rateia por tempo de execução quando todos têm', () => {
    const out = distributeKcalByExercise(
      [{ executionMinutes: 10, volumeKg: 999 }, { executionMinutes: 30, volumeKg: 1 }],
      400,
    )
    // 10:30 → 100 : 300
    expect(out).toEqual([100, 300])
    expect(out[0] + out[1]).toBe(400)
  })

  it('cai pra volume quando nem todos têm tempo', () => {
    const out = distributeKcalByExercise(
      [{ executionMinutes: 0, volumeKg: 300 }, { executionMinutes: 5, volumeKg: 100 }],
      480,
    )
    // usa volume 300:100 → 360 : 120
    expect(out).toEqual([360, 120])
  })

  it('a soma SEMPRE fecha com o total (resto distribuído nas maiores frações)', () => {
    const out = distributeKcalByExercise(
      [{ volumeKg: 1 }, { volumeKg: 1 }, { volumeKg: 1 }],
      100,
    )
    expect(out.reduce((a, b) => a + b, 0)).toBe(100)
    // 33.33 cada → [34,33,33] em alguma ordem
    expect(out.slice().sort((a, b) => a - b)).toEqual([33, 33, 34])
  })

  it('divide igual quando não há tempo nem volume', () => {
    const out = distributeKcalByExercise([{}, {}, {}, {}], 100)
    expect(out.reduce((a, b) => a + b, 0)).toBe(100)
    expect(out.slice().sort((a, b) => a - b)).toEqual([25, 25, 25, 25])
  })

  it('total zero/inválido → tudo zero', () => {
    expect(distributeKcalByExercise([{ volumeKg: 10 }, { volumeKg: 20 }], 0)).toEqual([0, 0])
    expect(distributeKcalByExercise([{ volumeKg: 10 }], NaN)).toEqual([0])
  })

  it('lista vazia → []', () => {
    expect(distributeKcalByExercise([], 500)).toEqual([])
  })

  it('um exercício leva o total inteiro', () => {
    expect(distributeKcalByExercise([{ volumeKg: 500 }], 273)).toEqual([273])
  })
})

describe('distributeKcalWithFixed', () => {
  it('cardio recebe kcal fixa; força rateia o restante por volume', () => {
    const out = distributeKcalWithFixed(
      [
        { fixedKcal: 94 },                 // cardio
        { volumeKg: 1000 },                // força
        { volumeKg: 1000 },                // força
      ],
      200, // parte de força
    )
    expect(out).toEqual([94, 100, 100])
    expect(out.reduce((a, b) => a + b, 0)).toBe(294)
  })

  it('sem fixo, rateia o flexível entre todos (por volume)', () => {
    const out = distributeKcalWithFixed(
      [{ volumeKg: 1000 }, { volumeKg: 3000 }],
      100,
    )
    expect(out).toEqual([25, 75])
  })

  it('só cardio (sem flexível) mantém os valores fixos', () => {
    expect(distributeKcalWithFixed([{ fixedKcal: 120 }, { fixedKcal: 80 }], 0)).toEqual([120, 80])
  })

  it('fixo presente mas flexível 0 → demais ficam zerados', () => {
    expect(distributeKcalWithFixed([{ fixedKcal: 90 }, { volumeKg: 500 }], 0)).toEqual([90, 0])
  })

  it('rateio flexível fecha exatamente (largest remainder)', () => {
    const out = distributeKcalWithFixed(
      [{ fixedKcal: 50 }, { volumeKg: 1 }, { volumeKg: 1 }, { volumeKg: 1 }],
      100,
    )
    expect(out[0]).toBe(50)
    expect(out[1] + out[2] + out[3]).toBe(100)
  })
})
