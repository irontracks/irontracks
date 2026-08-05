import { describe, it, expect } from 'vitest'
import { plateHintFor, formatPerSide, plateKindOf } from '../plateHint'
import type { PlateInventory } from '../plateInventory'

/**
 * A dica de anilhas para o peso DIGITADO (pedido do dono, 04/08/2026: "coloco
 * 260 e abaixo ele fala quantas anilhas cada lado").
 *
 * O caso que motivou tudo é leg press, e é justamente onde a UI antiga não
 * oferecia nada: o botão da calculadora só aparecia em `equipmentClass ===
 * 'barbell'`.
 */

/** Academia do dono, como está nas settings dele: só 5, 10 e 20 kg. */
const INV_DONO: PlateInventory = {
  counts: { '5': 7, '10': 8, '20': 30 },
  barWeightKg: 20,
}

/** Academia completa. */
const INV_CHEIO: PlateInventory = {
  counts: { '1.25': 4, '2.5': 4, '5': 8, '10': 8, '20': 20 },
  barWeightKg: 20,
}

describe('quem tem anilha — a regra que decide se a dica existe', () => {
  it.each(['Leg press 45º', 'Hack squat', 'Agachamento pendular', 'V-squat'])(
    '%s é máquina de anilha',
    (n) => expect(plateKindOf(n)).toBe('plate_machine'),
  )

  it.each(['Supino reto com barra', 'Agachamento livre com barra', 'Remada curvada com barra'])(
    '%s é barra',
    (n) => expect(plateKindOf(n)).toBe('barbell'),
  )

  it.each([
    ['Cadeira extensora', 'máquina de pino'],
    ['Puxada alta na polia', 'cabo'],
    ['Supino com halteres', 'halteres'],
    ['Supino no Smith', 'barra guiada de peso desconhecido'],
    ['Remada cavalinho', 'anilha numa ponta só'],
    ['Landmine press', 'idem'],
  ])('%s não tem dica (%s)', (n) => expect(plateKindOf(n)).toBeNull())
})

describe('o caso do dono: leg press 260', () => {
  it('o número digitado é a SOMA das anilhas — sem descontar carro', () => {
    const hint = plateHintFor('Leg press 45º', 260, INV_DONO)
    expect(hint).not.toBeNull()
    expect(hint!.kind).toBe('plate_machine')
    expect(hint!.barKg).toBe(0)
    // 260 total → 130 por lado
    expect(hint!.perSide.reduce((a, b) => a + b, 0)).toBe(130)
    expect(hint!.exact).toBe(true)
  })

  it('monta com o que ELE tem — nunca sugere anilha que não está no inventário', () => {
    const hint = plateHintFor('Leg press 45º', 260, INV_DONO)
    for (const p of hint!.perSide) expect([5, 10, 20]).toContain(p)
  })

  it('a dica sai legível', () => {
    const hint = plateHintFor('Leg press 45º', 260, INV_DONO)
    expect(formatPerSide(hint!.perSide)).toBe('6×20 + 1×10')
  })
})

describe('barra livre desconta a barra', () => {
  it('100 kg com barra de 20 → 40 por lado', () => {
    const hint = plateHintFor('Supino reto com barra', 100, INV_CHEIO)
    expect(hint!.kind).toBe('barbell')
    expect(hint!.barKg).toBe(20)
    expect(hint!.perSide.reduce((a, b) => a + b, 0)).toBe(40)
    expect(hint!.exact).toBe(true)
  })

  it('peso igual ou menor que a barra não vira dica', () => {
    expect(plateHintFor('Supino reto com barra', 20, INV_CHEIO)).toBeNull()
    expect(plateHintFor('Supino reto com barra', 15, INV_CHEIO)).toBeNull()
  })

  it('respeita a barra cadastrada, não os 20 kg fixos', () => {
    const inv: PlateInventory = { counts: { '10': 8, '20': 8 }, barWeightKg: 10 }
    const hint = plateHintFor('Supino reto com barra', 90, inv)
    expect(hint!.barKg).toBe(10)
    expect(hint!.perSide.reduce((a, b) => a + b, 0)).toBe(40)
  })
})

describe('subset-sum, não guloso — o motivo de reusar o decompose', () => {
  it('alvo que o guloso encalharia fecha exato', () => {
    // Só pares de 25, 20 e 10. Guloso pega 25 e sobra 5 (encalha); 20+10 fecha.
    const inv: PlateInventory = { counts: { '25': 2, '20': 2, '10': 2 }, barWeightKg: 0 }
    const hint = plateHintFor('Leg press 45º', 60, inv)
    expect(hint!.exact).toBe(true)
    expect(hint!.perSide.reduce((a, b) => a + b, 0)).toBe(30)
  })
})

describe('quando não fecha exato, não mente', () => {
  it('marca `exact: false` e devolve o que dá pra montar (nunca acima do pedido)', () => {
    const inv: PlateInventory = { counts: { '20': 10 }, barWeightKg: 0 }
    const hint = plateHintFor('Leg press 45º', 130, inv) // 65/lado, só pares de 20
    expect(hint!.exact).toBe(false)
    expect(hint!.total).toBeLessThanOrEqual(130)
  })
})

describe('entradas ruins não viram dica', () => {
  it.each([0, -10, NaN])('peso %s → null', (w) => {
    expect(plateHintFor('Leg press 45º', w as number, INV_DONO)).toBeNull()
  })

  it('aceita vírgula decimal (o teclado brasileiro)', () => {
    const hint = plateHintFor('Supino reto com barra', '62,5', INV_CHEIO)
    expect(hint).not.toBeNull()
    expect(hint!.perSide.reduce((a, b) => a + b, 0)).toBeCloseTo(21.25, 2)
  })

  it('exercício vazio → null', () => {
    expect(plateHintFor('', 100, INV_CHEIO)).toBeNull()
    expect(plateHintFor(null, 100, INV_CHEIO)).toBeNull()
  })
})

describe('formatPerSide', () => {
  it('agrupa iguais e ordena da mais pesada', () => {
    expect(formatPerSide([20, 20, 10, 5])).toBe('2×20 + 1×10 + 1×5')
  })

  it('usa vírgula decimal', () => {
    expect(formatPerSide([2.5])).toBe('1×2,5')
  })

  it('lista vazia → string vazia', () => {
    expect(formatPerSide([])).toBe('')
  })
})
