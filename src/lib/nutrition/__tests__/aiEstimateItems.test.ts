/**
 * A estimativa por IA passou a SEPARAR os alimentos (25/08/2026).
 *
 * O lançamento por texto tenta primeiro o resolvedor local (`resolveFood`),
 * que já grava item a item com gramas. Quando ele não reconhece a frase, cai
 * na IA — e o prompt mandava, literalmente, "some tudo e retorne um único
 * objeto". Resultado no iPhone do dono: a refeição aparecia como UMA linha,
 * "arroz branco cozido com filé de tilápia grelhada", `grams: 0`.
 *
 * Medido na conta dele antes de mexer: 75 refeições com um item só contra 131
 * com dois ou mais — as de um item são justamente as que passaram pela IA.
 */
import { describe, it, expect } from 'vitest'
import { buildEstimatePrompt, itemsParaGravar, parseEstimateOutput } from '@/lib/nutrition/aiEstimate'

const RESPOSTA = JSON.stringify({
  foodName: 'Almoço',
  calories: 615, protein: 57, carbs: 70, fat: 7,
  items: [
    { label: 'arroz branco cozido', grams: 250, calories: 320, protein: 6, carbs: 70, fat: 1 },
    { label: 'filé de tilápia grelhada', grams: 250, calories: 295, protein: 51, carbs: 0, fat: 6 },
  ],
})

describe('prompt', () => {
  it('manda SEPARAR em alimentos, e não somar tudo', () => {
    const p = buildEstimatePrompt('arroz branco cozido com filé de tilápia grelhada') ?? ''
    expect(p).toMatch(/SEPARE a refeição em alimentos individuais/)
    expect(p, 'era esta a linha que produzia o item único').not.toMatch(/Some tudo e retorne um único objeto/)
    expect(p).toMatch(/"items"/)
  })

  /**
   * Medido contra a API real em 25/08/2026: sem esta linha, "1 esfirra de
   * frango com requeijão" voltava como massa + frango desfiado + requeijão —
   * o app desmontando um preparo que o usuário lançou como UM item. Com ela,
   * voltou a ser um item de 90 g.
   */
  it('não manda desmontar um preparo único em ingredientes', () => {
    const p = buildEstimatePrompt('1 esfirra de frango com requeijão') ?? ''
    expect(p).toMatch(/NÃO desmonte/)
    expect(p).toMatch(/é\s*\n?\s*.{0,40}UM item/s)
  })

  it('pede a quantidade ESTIMADA quando o usuário não disser', () => {
    const p = buildEstimatePrompt('arroz com frango') ?? ''
    expect(p).toMatch(/ESTIME a porção usual/)
  })

  it('texto curto demais não vira chamada paga', () => {
    expect(buildEstimatePrompt('a')).toBeNull()
  })
})

describe('parse', () => {
  it('lê os alimentos com quantidade e macros de cada um', () => {
    const out = parseEstimateOutput(RESPOSTA)!
    expect(out.items).toHaveLength(2)
    expect(out.items[0]).toMatchObject({ label: 'arroz branco cozido', grams: 250, calories: 320 })
    expect(out.items[1].protein).toBe(51)
  })

  /** Contrato antigo (ou modelo que ignorou o campo) continua válido. */
  it('resposta sem `items` não quebra o lançamento', () => {
    const out = parseEstimateOutput(JSON.stringify({
      foodName: 'Almoço', calories: 615, protein: 57, carbs: 70, fat: 7,
    }))!
    expect(out.items).toEqual([])
    expect(out.calories).toBe(615)
  })

  it('item sem rótulo é descartado — linha em branco não é alimento', () => {
    const out = parseEstimateOutput(JSON.stringify({
      foodName: 'X', calories: 10, protein: 1, carbs: 1, fat: 1,
      items: [{ label: '  ', grams: 10, calories: 5, protein: 0, carbs: 0, fat: 0 }],
    }))!
    expect(out.items).toEqual([])
  })

  it('clampa valores absurdos do modelo em vez de gravá-los', () => {
    const out = parseEstimateOutput(JSON.stringify({
      foodName: 'X', calories: 10, protein: 1, carbs: 1, fat: 1,
      items: [{ label: 'arroz', grams: 999999, calories: 99999, protein: 9999, carbs: 9999, fat: 9999 }],
    }))!
    expect(out.items[0].grams).toBe(5000)
    expect(out.items[0].calories).toBe(6000)
  })
})

describe('itemsParaGravar', () => {
  it('grava os alimentos separados quando o modelo separou', () => {
    const itens = itemsParaGravar(parseEstimateOutput(RESPOSTA)!, 'Almoço')
    expect(itens.map((i) => i.label)).toEqual(['arroz branco cozido', 'filé de tilápia grelhada'])
  })

  /**
   * O fallback é o que impede o lançamento de PIORAR quando o detalhe falha:
   * perder a refeição inteira porque a lista veio vazia seria trocar um
   * incômodo por perda de dado.
   */
  it('sem itens, mantém o item único de sempre — com o total da refeição', () => {
    const out = parseEstimateOutput(JSON.stringify({
      foodName: 'Almoço', calories: 615, protein: 57, carbs: 70, fat: 7,
    }))!
    expect(itemsParaGravar(out, 'Almoço')).toEqual([
      { label: 'Almoço', grams: 0, calories: 615, protein: 57, carbs: 70, fat: 7 },
    ])
  })

  /**
   * Lista de UM item só repete a refeição e ainda desalinha o total (o item
   * carrega os macros somados). Nesse caso o item único é mais honesto.
   */
  it('um item só não conta como detalhe', () => {
    const out = parseEstimateOutput(JSON.stringify({
      foodName: '5 ovos cozidos', calories: 388, protein: 33, carbs: 3, fat: 28,
      items: [{ label: '5 ovos cozidos', grams: 250, calories: 388, protein: 33, carbs: 3, fat: 28 }],
    }))!
    const itens = itemsParaGravar(out, '5 ovos cozidos')
    expect(itens).toHaveLength(1)
    expect(itens[0].calories, 'o total da refeição manda').toBe(388)
  })
})
