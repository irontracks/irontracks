import { describe, it, expect } from 'vitest'
import { analyzeMeal } from '../parser'

/**
 * Perda SILENCIOSA de comida no lançamento.
 *
 * O parser trata a primeira "linha" como NOME da refeição quando ela não tem
 * dígito ("Almoço" + as linhas dos alimentos). Só que o split de " e ", vírgula e
 * "+" também produz "linhas" — então "ovo e banana" virava nome="ovo" e o ovo era
 * DESCARTADO. Não virava nem unknownLine: o usuário não tinha como perceber.
 *
 * Por isso "200g de frango e 100g de arroz" funcionava (tem dígito, escapa da
 * heurística) e "ovo e banana" não.
 *
 * Regra nova, com duas condições:
 *  1. Só é candidata a nome a primeira linha FÍSICA (que sobreviveu inteira aos
 *     splits) — separador de item nunca vira nome.
 *  2. E ela não pode ser um alimento reconhecido.
 */
const parse = (text: string) => {
  const a = analyzeMeal(text)
  return {
    foods: a.items.map((i) => i.label),
    grams: a.items.map((i) => i.grams),
    unknown: a.unknownLines,
    name: a.meal.foodName,
    kcal: a.meal.calories,
  }
}

describe('o bug: comida sumindo em silêncio', () => {
  it('"ovo e banana" mantém os DOIS (o ovo evaporava)', () => {
    const r = parse('ovo e banana')
    expect(r.foods).toHaveLength(2)
    expect(r.foods.join(' ')).toContain('ovo')
    expect(r.foods.join(' ')).toContain('banana')
  })

  it('"arroz cozido e carne bovina" mantém os DOIS', () => {
    const r = parse('arroz cozido e carne bovina')
    expect(r.foods).toHaveLength(2)
    expect(r.kcal).toBeGreaterThan(400) // 234 (arroz) + 254 (carne)
  })

  it('vírgula também é separador, não nome de refeição', () => {
    const r = parse('ovo, banana')
    expect(r.foods).toHaveLength(2)
  })

  it('"+" também', () => {
    const r = parse('ovo + banana')
    expect(r.foods).toHaveLength(2)
  })

  it('o que NÃO é reconhecido vira unknownLine — nunca some calado', () => {
    // "xyz" não é alimento nem nome: o usuário PRECISA ver que não entrou.
    const r = parse('xyz e banana')
    expect(r.unknown).toContain('xyz')
    expect(r.foods).toHaveLength(1)
  })

  it('três alimentos, nenhum perdido', () => {
    const r = parse('ovo, banana e aveia')
    expect(r.foods).toHaveLength(3)
  })
})

describe('nome de refeição — o recurso continua funcionando', () => {
  it('primeira LINHA sem dígito e que não é alimento vira o nome', () => {
    const r = parse('Almoço\n150g de frango\n100g de arroz cozido')
    expect(r.name).toBe('Almoço')
    expect(r.foods).toHaveLength(2)
  })

  it('"Café da manhã" é nome, não 200g de café', () => {
    // 'cafe' É um alimento da base — a heurística de nome não pode confundir.
    const r = parse('Café da manhã\n2 ovos')
    expect(r.name).toBe('Café da manhã')
    expect(r.foods).toHaveLength(1)
    expect(r.grams[0]).toBe(100) // 2 ovos, sem café nenhum
  })

  it('primeira linha que É alimento continua sendo comida', () => {
    const r = parse('ovo\nbanana')
    expect(r.foods).toHaveLength(2)
    expect(r.name).toBe('Refeição')
  })

  it('linha única nunca vira nome (não sobraria comida)', () => {
    const r = parse('banana')
    expect(r.foods).toHaveLength(1)
    expect(r.name).toBe('Refeição')
  })

  it('nome + alimentos na MESMA linha seguinte, separados por " e "', () => {
    const r = parse('Lanche da tarde\novo e banana')
    expect(r.name).toBe('Lanche da tarde')
    expect(r.foods).toHaveLength(2)
  })
})

describe('o que já funcionava não muda', () => {
  it('quantidades explícitas com " e "', () => {
    const r = parse('200g de frango e 100g de arroz cozido')
    expect(r.foods).toHaveLength(2)
    expect(r.grams).toEqual([200, 100])
  })

  it('vírgula decimal não é separador', () => {
    const r = parse('1,5 colher de arroz cozido')
    expect(r.foods).toHaveLength(1)
    expect(r.grams[0]).toBe(38) // 1,5 × 25g
  })
})
