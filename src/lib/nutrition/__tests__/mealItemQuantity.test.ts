import { describe, it, expect } from 'vitest'
import {
  lerQuantidadeDoRotulo,
  escreverQuantidadeNoRotulo,
  quantidadeEditavel,
  reescalarItem,
  QUANTIDADE_MAXIMA,
} from '../mealItemQuantity'
import type { MealItem } from '../engine'

const item = (over: Partial<MealItem>): MealItem => ({
  label: '250g arroz branco',
  grams: 250,
  calories: 384,
  protein: 27,
  carbs: 29,
  fat: 18,
  ...over,
})

describe('lerQuantidadeDoRotulo', () => {
  it('lê gramas na frente do rótulo', () => {
    expect(lerQuantidadeDoRotulo('250g arroz branco')).toEqual({ valor: 250, unidade: 'g', resto: ' arroz branco' })
  })

  it('lê mililitros e não confunde com gramas', () => {
    expect(lerQuantidadeDoRotulo('500ml leite zero lactose')).toEqual({
      valor: 500,
      unidade: 'ml',
      resto: ' leite zero lactose',
    })
  })

  it('lê contagem pura ("2 ovos")', () => {
    expect(lerQuantidadeDoRotulo('2 ovos')).toEqual({ valor: 2, unidade: ' ', resto: 'ovos' })
  })

  it('lê unidade aproximada ("2 colheres de arroz")', () => {
    const r = lerQuantidadeDoRotulo('2 colheres de arroz')
    expect(r?.valor).toBe(2)
    expect(r?.resto).toBe(' de arroz')
  })

  it('aceita vírgula decimal', () => {
    expect(lerQuantidadeDoRotulo('1,5kg carne')?.valor).toBe(1.5)
  })

  it('devolve null quando o rótulo não começa com quantidade (item da IA)', () => {
    expect(lerQuantidadeDoRotulo('arroz branco cozido')).toBeNull()
  })

  it('devolve null para rótulo vazio', () => {
    expect(lerQuantidadeDoRotulo('')).toBeNull()
  })
})

describe('escreverQuantidadeNoRotulo', () => {
  it('troca só o número, preservando a unidade "g"', () => {
    expect(escreverQuantidadeNoRotulo('250g arroz branco', 150)).toBe('150g arroz branco')
  })

  it('preserva "ml" — NÃO pode virar "g"', () => {
    expect(escreverQuantidadeNoRotulo('500ml leite zero lactose', 300)).toBe('300ml leite zero lactose')
  })

  it('preserva contagem sem unidade ("2 ovos" → "3 ovos")', () => {
    expect(escreverQuantidadeNoRotulo('2 ovos', 3)).toBe('3 ovos')
  })

  it('sufixo de preparo sobrevive à reescrita', () => {
    expect(escreverQuantidadeNoRotulo('200g frango · à milanesa', 100)).toBe('100g frango · à milanesa')
  })

  it('rótulo sem quantidade reconhecível volta intacto', () => {
    expect(escreverQuantidadeNoRotulo('arroz branco cozido', 300)).toBe('arroz branco cozido')
  })
})

describe('quantidadeEditavel', () => {
  it('item do parser (label com quantidade) é editável pela origem "rotulo"', () => {
    expect(quantidadeEditavel(item({}))).toEqual({ valor: 250, unidade: 'g', origem: 'rotulo' })
  })

  it('item da IA (label sem quantidade, grams > 0) é editável pela origem "grams"', () => {
    expect(quantidadeEditavel(item({ label: 'Arroz branco cozido', grams: 180 }))).toEqual({
      valor: 180,
      unidade: 'g',
      origem: 'grams',
    })
  })

  it('item de memo/legado (grams: 0) NÃO é editável', () => {
    expect(quantidadeEditavel(item({ label: 'Refeição', grams: 0 }))).toBeNull()
  })

  it('null/undefined não quebra', () => {
    expect(quantidadeEditavel(null)).toBeNull()
    expect(quantidadeEditavel(undefined)).toBeNull()
  })
})

describe('reescalarItem — reescala proporcional', () => {
  it('250 → 150 escala macros e gramas na mesma proporção (0,6)', () => {
    const r = reescalarItem(item({}), 150)
    expect(r.label).toBe('150g arroz branco')
    expect(r.grams).toBe(150)
    expect(r.calories).toBe(Math.round(384 * 0.6))
    expect(r.protein).toBe(Math.round(27 * 0.6))
    expect(r.carbs).toBe(Math.round(29 * 0.6))
    expect(r.fat).toBe(Math.round(18 * 0.6))
  })

  it('a escala é PROPORCIONAL — não fixa em 1 nem em outro fator', () => {
    // 500 é o dobro de 250: tudo tem que dobrar, não ficar igual.
    const r = reescalarItem(item({}), 500)
    expect(r.grams).toBe(500)
    expect(r.calories).toBe(384 * 2)
  })

  it('round-trip 250 → 150 → 250 volta ao ORIGINAL exato (sem deriva de arredondamento)', () => {
    const original = item({})
    const reduzido = reescalarItem(original, 150)
    // A chamada seguinte reescala a partir do ORIGINAL, nunca do reduzido —
    // é assim que o componente usa este módulo (itensOriginais[i]).
    const devolta = reescalarItem(original, 250)
    expect(devolta).toEqual(original)
    expect(reduzido.grams).not.toBe(original.grams)
  })

  it('"2 ovos" com grams 100 → 3 vira "3 ovos" com 150g', () => {
    const ovos = item({ label: '2 ovos', grams: 100, calories: 140, protein: 12, carbs: 0, fat: 10 })
    const r = reescalarItem(ovos, 3)
    expect(r.label).toBe('3 ovos')
    expect(r.grams).toBe(150)
    expect(r.calories).toBe(210)
  })

  it('item da IA (sem quantidade no rótulo) reescala via grams e MANTÉM o rótulo', () => {
    const ia = item({ label: 'Arroz branco cozido', grams: 180, calories: 234, protein: 4, carbs: 51, fat: 0 })
    const r = reescalarItem(ia, 90)
    expect(r.label).toBe('Arroz branco cozido')
    expect(r.grams).toBe(90)
    expect(r.calories).toBe(117)
  })

  it('item sem densidade (grams: 0) volta INTACTO — sem Infinity, sem lixo', () => {
    const semDensidade = item({ label: 'Refeição', grams: 0, calories: 500 })
    const r = reescalarItem(semDensidade, 300)
    expect(r).toEqual(semDensidade)
  })

  it('novoValor <= 0 NÃO apaga nem zera o item — devolve intacto', () => {
    const original = item({})
    expect(reescalarItem(original, 0)).toEqual(original)
    expect(reescalarItem(original, -50)).toEqual(original)
  })

  it('novoValor não numérico (NaN) devolve o item intacto', () => {
    const original = item({})
    expect(reescalarItem(original, NaN)).toEqual(original)
  })

  it('clampa em QUANTIDADE_MAXIMA — erro de digitação não vira refeição de 50kg', () => {
    const r = reescalarItem(item({}), QUANTIDADE_MAXIMA * 10)
    expect(r.grams).toBe(QUANTIDADE_MAXIMA)
  })
})
