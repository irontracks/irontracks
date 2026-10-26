import { describe, it, expect } from 'vitest'
import { rankSwapOptions, type SwapCandidate } from '../foodSwap'
import { cabeNoCopo, ehRefeicaoDeCopo, isPlatedProtein } from '../mealCoherence'
import { mealGroupOf } from '../mealContext'
import { isUsableAsSwapCandidate } from '../foodItemSanity'

/**
 * Copo × talher na troca de alimento (26/10/2026, relato do dono com prints).
 *
 * Os números são os da conta dele, lidos no banco — não inventados:
 *  - Ceia = "Leite desnatado zero lactose" 150 g + uma carne; o ↻ girava entre
 *    músculo, contrafilé e estrogonofe, todos ao lado do copo de leite.
 *  - Jantar = arroz + "Picadinho de miolo de alcatra" 180 g + feijão; a opção
 *    oferecida era 820 g de "Leite Bio Ciclos".
 *
 * O motor acertava a CLASSE (proteína por proteína) nos dois casos. Faltava saber
 * se o prato é de copo ou de talher.
 */

const LEITE_DESNATADO = { food: 'Leite desnatado zero lactose', grams: 150, calories: 47, protein: 5, carbs: 7, fat: 0 }
const PICADINHO = { food: 'Picadinho de boi', grams: 70, calories: 168, protein: 21, carbs: 0, fat: 8 }
const ALCATRA = { food: 'Picadinho de miolo de alcatra', grams: 180, calories: 434, protein: 57, carbs: 0, fat: 21 }
const ARROZ = { food: 'Arroz branco cozido', grams: 110, calories: 143, protein: 3, carbs: 31, fat: 0 }
const FEIJAO = { food: 'Feijão carioca cozido', grams: 150, calories: 116, protein: 8, carbs: 21, fat: 1 }

/** Por 100 g. "Leite Bio Ciclos Mais Proteína" é o cadastro real da biblioteca do dono. */
const CANDIDATOS: SwapCandidate[] = [
  { name: 'Leite Bio Ciclos Mais Proteína', kcal: 55, protein: 7, carbs: 5, fat: 1, source: 'custom' },
  { name: 'Músculo cozido', kcal: 220, protein: 32, carbs: 0, fat: 9, source: 'database' },
  { name: 'Contrafilé grelhado', kcal: 194, protein: 26, carbs: 0, fat: 9, source: 'database' },
  { name: 'Estrogonofe de carne', kcal: 173, protein: 18, carbs: 3, fat: 10, source: 'database' },
  { name: 'Patinho moído', kcal: 219, protein: 36, carbs: 0, fat: 7, source: 'database' },
  { name: 'Iogurte natural proteico', kcal: 60, protein: 8, carbs: 4, fat: 1, source: 'database' },
  // Peixe da base curada: foi o que a medição com o repertório real devolveu na
  // Ceia depois da primeira versão (lista negra por nome) — cação, corvina...
  { name: 'Cação', kcal: 116, protein: 25, carbs: 0, fat: 1, source: 'database' },
  { name: 'Corvina', kcal: 101, protein: 18, carbs: 0, fat: 3, source: 'database' },
  { name: 'Whey Growth', kcal: 413, protein: 77, carbs: 11, fat: 7, source: 'custom' },
]

const nomes = (r: { food: string }[]) => r.map((x) => x.food)

describe('Ceia de copo: nada de carne de prato ao lado do leite', () => {
  const ceia = [LEITE_DESNATADO, PICADINHO]

  it('"Ceia" é refeição principal no mealContext — por isso a regra precisa do prato, não do nome', () => {
    expect(mealGroupOf('Ceia')).toBe('main')
  })

  it('trocar a carne da Ceia não oferece outra carne; oferece o que vai no copo', () => {
    const r = rankSwapOptions(PICADINHO, CANDIDATOS, {
      mealGroup: mealGroupOf('Ceia'),
      mealItems: ceia.map((i) => i.food),
      exclude: ceia.map((i) => i.food),
    })
    expect(nomes(r).length).toBeGreaterThan(0)
    expect(nomes(r).filter((n) => !cabeNoCopo(n))).toEqual([])
    expect(nomes(r)).toContain('Leite Bio Ciclos Mais Proteína')
  })

  it('a clara da Ceia (o plano real) troca por whey — a Ceia "principal" de copo não barra o pó', () => {
    const LEITE = { food: 'Leite desnatado zero lactose', grams: 300, calories: 93, protein: 9, carbs: 14.1, fat: 0 }
    const CLARA = { food: 'Clara de ovo cozida', grams: 150, calories: 89.1, protein: 20.3, carbs: 0, fat: 0.2 }
    const r = rankSwapOptions(CLARA, CANDIDATOS, {
      mealGroup: mealGroupOf('Ceia'),
      mealItems: [LEITE.food, CLARA.food],
      exclude: [LEITE.food, CLARA.food],
    })
    expect(nomes(r)).toContain('Whey Growth')
    expect(nomes(r).filter((n) => !cabeNoCopo(n))).toEqual([])
  })

  it('trocar o leite proteico da Ceia também não devolve carne', () => {
    const LEITE_BIO = { food: 'Leite Bio Ciclos Mais Proteína', grams: 300, calories: 165, protein: 21, carbs: 15, fat: 3 }
    const r = rankSwapOptions(LEITE_BIO, CANDIDATOS, {
      mealGroup: mealGroupOf('Ceia'),
      mealItems: [LEITE_DESNATADO.food, LEITE_BIO.food],
    })
    expect(nomes(r).filter((n) => !cabeNoCopo(n))).toEqual([])
  })
})

describe('Jantar de talher: líquido não substitui a carne', () => {
  const jantar = [ARROZ, ALCATRA, FEIJAO]

  it('a alcatra do jantar não vira 820 g de leite', () => {
    const r = rankSwapOptions(ALCATRA, CANDIDATOS, {
      mealGroup: mealGroupOf('Jantar'),
      mealItems: jantar.map((i) => i.food),
      exclude: jantar.map((i) => i.food),
    })
    expect(nomes(r).filter((n) => /leite|iogurte/i.test(n))).toEqual([])
    // A troca continua existindo — carne por carne é o que se espera aqui.
    expect(nomes(r)).toContain('Patinho moído')
  })

  it('jantar com iogurte de sobremesa continua sendo de talher: a carne troca por carne', () => {
    const IOGURTE = { food: 'Iogurte natural', grams: 170, calories: 100, protein: 7, carbs: 8, fat: 5 }
    const r = rankSwapOptions(ALCATRA, CANDIDATOS, {
      mealGroup: mealGroupOf('Jantar'),
      mealItems: [ARROZ.food, ALCATRA.food, IOGURTE.food],
    })
    expect(nomes(r)).toContain('Patinho moído')
  })
})

describe('ehRefeicaoDeCopo', () => {
  it.each([
    ['Ceia: leite + carne', 'Picadinho de boi', ['Leite desnatado zero lactose', 'Picadinho de boi'], true],
    ['shake: leite + aveia + whey', 'Whey protein', ['Leite integral', 'Aveia em flocos', 'Whey protein'], true],
    ['jantar com arroz', 'Picadinho de boi', ['Arroz branco', 'Picadinho de boi'], false],
    ['jantar com iogurte de sobremesa', 'Frango', ['Arroz', 'Frango', 'Iogurte natural'], false],
    ['só a água ao lado — líquido fino não é copo de comida', 'Frango', ['Água', 'Frango'], false],
    ['a refeição é só o item', 'Picadinho de boi', ['Picadinho de boi'], false],
  ])('%s → %s', (_rotulo, item, refeicao, esperado) => {
    expect(ehRefeicaoDeCopo(item, refeicao)).toBe(esperado)
  })
})

describe('isPlatedProtein reconhece as carnes que giravam no ↻ da Ceia', () => {
  it.each(['Músculo cozido', 'Contrafilé', 'Picadinho de boi', 'Estrogonofe', 'Strogonoff de frango', 'Carne bovina moída'])(
    '%s', (nome) => { expect(isPlatedProtein(nome)).toBe(true) },
  )
  it.each(['Leite desnatado', 'Iogurte proteico', 'Whey protein', 'Queijo cottage', 'Clara de ovo'])(
    '%s NÃO é carne de prato', (nome) => { expect(isPlatedProtein(nome)).toBe(false) },
  )
})

describe('teto de proteína por 100 g: o "aprendido" que guardou o TOTAL da porção', () => {
  it('os dois cadastros reais da conta do dono saem da lista de candidatos', () => {
    // nutrition_learned_foods, lidos em 26/10/2026.
    expect(isUsableAsSwapCandidate({ name: 'Músculo cozido', kcal: 446, protein: 71, carbs: 0, fat: 17 })).toBe(false)
    expect(isUsableAsSwapCandidate({ name: 'picadinho de boi', kcal: 425, protein: 52, carbs: 5, fat: 21 })).toBe(false)
  })

  it('carne de verdade e o pó continuam passando', () => {
    expect(isUsableAsSwapCandidate({ name: 'Músculo cozido', kcal: 220, protein: 32, carbs: 0, fat: 9 })).toBe(true)
    expect(isUsableAsSwapCandidate({ name: 'Queijo parmesão', kcal: 453, protein: 36, carbs: 2, fat: 34 })).toBe(true)
    expect(isUsableAsSwapCandidate({ name: 'Whey protein', kcal: 400, protein: 80, carbs: 8, fat: 5 })).toBe(true)
    expect(isUsableAsSwapCandidate({ name: 'Proteína texturizada de soja', kcal: 330, protein: 52, carbs: 30, fat: 1 })).toBe(true)
    expect(isUsableAsSwapCandidate({ name: 'Albumina', kcal: 380, protein: 82, carbs: 5, fat: 0 })).toBe(true)
  })
})

describe('fiação: os TRÊS chamadores do motor passam os itens da refeição', () => {
  // Sem `mealItems` o motor não sabe se o prato é de copo, e as duas regras desligam
  // em silêncio — só no caminho que esqueceu. É a armadilha do `perSetMethodField`:
  // o ↻, a "Opção" do card e a variação da semana precisam dizer o mesmo.
  it.each([
    'src/app/api/nutrition/diet-plan/swap/route.ts',
    'src/app/api/nutrition/diet-plan/alternatives/route.ts',
    'src/lib/nutrition/weekPlan.ts',
  ])('%s', async (arquivo) => {
    const { readFileSync } = await import('node:fs')
    const codigo = readFileSync(arquivo, 'utf8').replace(/\/\/.*$/gm, '')
    expect(codigo).toMatch(/mealItems(:\s*meal\.items\.map\(\(i\)\s*=>\s*i\.food\)|,)/)
  })
})

describe('cabeNoCopo: lista de quem PODE ficar ao lado do leite', () => {
  it.each(['Queijo cottage', 'Clara de ovo cozida', 'Ovos mexidos', 'YoPRO+', 'Iogurte natural', 'Ricota', 'Leite Bio Ciclos Mais Proteína', 'Whey Growth', 'Aveia em flocos'])(
    '%s cabe', (nome) => { expect(cabeNoCopo(nome)).toBe(true) },
  )
  it.each(['Cação', 'Corvina', 'Músculo cozido', 'Contrafilé', 'Peito de frango', 'Arroz branco', 'Tofu'])(
    '%s NÃO cabe', (nome) => { expect(cabeNoCopo(nome)).toBe(false) },
  )
})
