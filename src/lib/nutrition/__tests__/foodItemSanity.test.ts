import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  MAX_PLAUSIBLE_KCAL_100G,
  hasEmbeddedQuantity,
  hasPlausibleDensity,
  isCompositeFoodName,
  isUsableAsSwapCandidate,
} from '../foodItemSanity'
import { candidatesFromMealRows, stripQuantityPrefix } from '../mealItemFoods'
import { mergeCandidates } from '../swapCandidates'
import { buildFoodMealMap, fitsMealGroup, isPreferredForMealGroup, mealGroupOf } from '../mealContext'
import { classifyFood, macrosPer100g, swapFood, type SwapCandidate } from '../foodSwap'

/**
 * Correção do relato do dono (03/08/2026), que apontou DOIS erros numa troca só —
 * macarrão do almoço virando "Pão Francês com Doce de Leite":
 *
 *   1. carbo de acompanhamento não se troca por carbo de café da tarde;
 *   2. "125g" de um item composto não diz quanto é de pão e quanto é de doce.
 *
 * Investigando o 2, o repertório aprendido dele mostrou-se quase todo inservível:
 * dos 42 "alimentos", 37 compostos, 14 com densidade fisicamente impossível
 * (1070, 1285, 1650 kcal/100 g — total da refeição gravado no campo per_100g) e 17
 * com a quantidade dentro do nome. Apenas 1 sobrevivia.
 */

const cand = (name: string, kcal: number, p: number, c: number, f: number, source: SwapCandidate['source'] = 'database'): SwapCandidate =>
  ({ name, kcal, protein: p, carbs: c, fat: f, source })

describe('item composto — "125 g disso" não é executável', () => {
  it.each([
    'Pão Francês com Doce de Leite',
    'Refeição de Arroz, Strogonoff e Batata Palha',
    'Whey Growth e Creatina',
    '1 esfirra de carne + 1 energético Monster Zero',
    'Hambúrguer Reforçado (Pão brioche, 2 hambúrgueres)',
    'Mingau de Aveia com Leite, Whey e Doce de Leite',
  ])('rejeita %s', (name) => {
    expect(isCompositeFoodName(name)).toBe(true)
  })

  it.each([
    'frango grelhado',
    'arroz integral',
    'batata doce',
    'peito de frango',
    'queijo cottage',
    'leite desnatado',
    'grao de bico',
  ])('aceita alimento simples: %s', (name) => {
    expect(isCompositeFoodName(name)).toBe(false)
  })
})

describe('densidade impossível — o dado está errado, não é alimento', () => {
  it('acima do teto físico não passa', () => {
    // Gordura pura tem ~884 kcal/100 g. 1070/1285/1650 são total de refeição.
    expect(hasPlausibleDensity({ kcal: 1070, protein: 65, carbs: 127, fat: 30 })).toBe(false)
    expect(hasPlausibleDensity({ kcal: 1650, protein: 110, carbs: 70, fat: 100 })).toBe(false)
    expect(MAX_PLAUSIBLE_KCAL_100G).toBeLessThanOrEqual(900)
  })

  it('macro acima de 100 g dentro de 100 g de comida é impossível', () => {
    expect(hasPlausibleDensity({ kcal: 400, protein: 30, carbs: 217, fat: 5 })).toBe(false)
  })

  it('azeite (884 kcal/100 g) — o extremo REAL — continua válido', () => {
    expect(hasPlausibleDensity({ kcal: 884, protein: 0, carbs: 0, fat: 100 })).toBe(true)
  })
})

describe('quantidade no nome — o motor é quem dimensiona a porção', () => {
  it.each(['50g de Whey Protein', '2 latas de Monster Zero', '400ml leite integral', '1 esfirra de carne', '350g bolo indiano'])(
    'rejeita %s',
    (name) => expect(hasEmbeddedQuantity(name)).toBe(true),
  )

  it('nome de alimento sem quantidade passa', () => {
    expect(hasEmbeddedQuantity('whey protein')).toBe(false)
    expect(hasEmbeddedQuantity('arroz cozido')).toBe(false)
  })
})

describe('isUsableAsSwapCandidate — o crivo completo', () => {
  it('deixa passar alimento de verdade', () => {
    expect(isUsableAsSwapCandidate(cand('frango grelhado', 165, 31, 0, 4))).toBe(true)
  })

  it('barra os casos reais que estragaram a troca', () => {
    expect(isUsableAsSwapCandidate(cand('Pão Francês com Doce de Leite', 301, 8, 61, 5))).toBe(false)
    expect(isUsableAsSwapCandidate(cand('Refeição Completa', 932, 59, 103, 40))).toBe(false)
    expect(isUsableAsSwapCandidate(cand('50g de Whey Protein', 203, 40, 4, 2))).toBe(false)
  })

  it('sem macro nenhum não serve — não dá pra dimensionar porção', () => {
    expect(isUsableAsSwapCandidate(cand('creatina', 0, 0, 0, 0))).toBe(false)
  })
})

describe('repertório vindo dos ITENS das refeições (a fonte certa)', () => {
  const rows = [
    {
      food_name: 'Almoço',
      items: [
        { label: '150g arroz', grams: 150, calories: 231, protein: 16, carbs: 17, fat: 11 },
        { label: '250g patinho moído', grams: 250, calories: 333, protein: 68, carbs: 0, fat: 8 },
      ],
    },
    {
      food_name: 'Café da Manhã',
      items: [{ label: '100g sucrilhos', grams: 100, calories: 380, protein: 7, carbs: 84, fat: 1 }],
    },
  ]

  it('tira a quantidade do label e vira nome de alimento', () => {
    expect(stripQuantityPrefix('150g arroz')).toBe('arroz')
    expect(stripQuantityPrefix('400ml leite integral')).toBe('leite integral')
    expect(stripQuantityPrefix('1 esfirra de carne')).toBe('esfirra de carne')
    expect(stripQuantityPrefix('frango grelhado')).toBe('frango grelhado')
  })

  it('deriva macros por 100 g das GRAMAS reais, não de um campo per_100g duvidoso', () => {
    const out = candidatesFromMealRows(rows)
    const arroz = out.find((c) => c.name === 'arroz')
    expect(arroz).toBeTruthy()
    expect(Math.round(arroz!.kcal)).toBe(154) // 231 kcal em 150 g
    expect(Math.round(arroz!.protein)).toBe(11)
  })

  it('item sem gramas não vira candidato (divisão por zero silenciosa)', () => {
    const out = candidatesFromMealRows([{ food_name: 'Almoço', items: [{ label: 'arroz', grams: 0, calories: 200 }] }])
    expect(out).toHaveLength(0)
  })

  it('entrada inválida não quebra', () => {
    expect(candidatesFromMealRows([])).toEqual([])
    expect(candidatesFromMealRows(null as unknown as unknown[])).toEqual([])
    expect(candidatesFromMealRows([{ items: 'nao e array' }])).toEqual([])
  })
})

describe('adequação à refeição — erro 1 do relato', () => {
  const rows = [
    { food_name: 'Almoço', items: [{ label: '150g arroz', grams: 150, calories: 231, protein: 16, carbs: 17, fat: 11 }] },
    { food_name: 'Janta', items: [{ label: '200g macarrao', grams: 200, calories: 262, protein: 10, carbs: 50, fat: 2 }] },
    { food_name: 'Café da Manhã', items: [{ label: '100g sucrilhos', grams: 100, calories: 380, protein: 7, carbs: 84, fat: 1 }] },
  ]
  const map = buildFoodMealMap(rows, stripQuantityPrefix)

  it('classifica o nome da refeição', () => {
    expect(mealGroupOf('Almoço')).toBe('main')
    expect(mealGroupOf('Janta')).toBe('main')
    expect(mealGroupOf('Café da Manhã')).toBe('snack')
    expect(mealGroupOf('Pós-Treino / Janta')).toBe('snack')
    expect(mealGroupOf('')).toBe('unknown')
  })

  it('"Café da Tarde / Pré-Treino" é lanche mesmo tendo dois sinais', () => {
    expect(mealGroupOf('Café da Tarde / Pré-Treino')).toBe('snack')
  })

  it('alimento de café NÃO cabe no almoço', () => {
    expect(fitsMealGroup('sucrilhos', 'main', map)).toBe(false)
    expect(fitsMealGroup('arroz', 'main', map)).toBe(true)
  })

  it('alimento SEM histórico não é bloqueado — só não ganha preferência', () => {
    // Bloquear o desconhecido esvaziaria a troca de quem tem pouco lançamento.
    expect(fitsMealGroup('quinoa', 'main', map)).toBe(true)
    expect(isPreferredForMealGroup('quinoa', 'main', map)).toBe(false)
    expect(isPreferredForMealGroup('arroz', 'main', map)).toBe(true)
  })

  it('na troca: macarrão do ALMOÇO não vira sucrilhos, mesmo sendo o carbo mais próximo', () => {
    const item = { food: 'Macarrão Parafuso', grams: 250, calories: 395, protein: 15, carbs: 77, fat: 2 }
    const candidates = [
      cand('sucrilhos', 380, 7, 84, 1, 'learned'),
      cand('arroz', 154, 11, 11, 7, 'learned'),
    ]
    const out = swapFood(item, candidates, { mealGroup: 'main', foodMealMap: map })
    expect(out?.food).not.toBe('sucrilhos')
  })

  it('o que ele comprovadamente come naquela refeição vem primeiro', () => {
    // Fixture calibrado pra ISOLAR a preferência: a quinoa tem desvio calórico
    // MENOR (308 g → ~394 kcal contra 275 g → ~357 kcal do arroz), então se o arroz
    // ganhar é por ser o que ele come no almoço, não por acidente de arredondamento.
    const item = { food: 'Macarrão Parafuso', grams: 250, calories: 395, protein: 15, carbs: 77, fat: 2 }
    const candidates = [
      cand('quinoa', 128, 4, 25, 2, 'database'),
      cand('arroz', 130, 3, 28, 0.3, 'learned'),
    ]
    const out = swapFood(item, candidates, { mealGroup: 'main', foodMealMap: map })
    expect(out?.food).toBe('arroz')
  })

  it('sem mapa de refeição, o comportamento antigo se mantém (nada quebra)', () => {
    const item = { food: 'Macarrão', grams: 250, calories: 395, protein: 15, carbs: 77, fat: 2 }
    const out = swapFood(item, [cand('arroz cozido', 130, 3, 28, 0.3)])
    expect(out?.food).toBe('arroz cozido')
  })
})

describe('source-guard: o crivo está ligado onde importa', () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  const candidates = strip(readFileSync('src/lib/nutrition/swapCandidates.ts', 'utf8'))
  const swapRoute = strip(readFileSync('src/app/api/nutrition/diet-plan/swap/route.ts', 'utf8'))
  const weekRoute = strip(readFileSync('src/app/api/nutrition/diet-plan/week/route.ts', 'utf8'))

  it('o crivo está EM USO no merge, não só importado', () => {
    // Guard falso pego em 04/08/2026: `toMatch(/isUsableAsSwapCandidate/)` casava
    // com o import e passava verde mesmo com o filtro desligado. Este exercita a
    // função de verdade — lixo entra, nada sai.
    const sujos = [
      cand('Refeição Completa', 932, 59, 103, 40, 'learned'),
      cand('Pão Francês com Doce de Leite', 301, 8, 61, 5, 'learned'),
      cand('50g de Whey Protein', 203, 40, 4, 2, 'learned'),
      cand('Hambúrguer Reforçado (Pão brioche)', 1650, 110, 70, 100, 'learned'),
    ]
    expect(mergeCandidates(sujos)).toEqual([])
    // E o alimento bom no meio do lixo sobrevive — com a inicial maiúscula, que o
    // merge aplica desde 01/09/2026 (o nome do repertório é o texto digitado pelo
    // usuário e passou a ser EXIBIDO no card do plano).
    expect(mergeCandidates([...sujos, cand('frango grelhado', 165, 31, 0, 4, 'learned')]).map((c) => c.name))
      .toEqual(['Frango grelhado'])
  })

  it('o repertório vem dos ITENS de refeição, com precedência sobre os "aprendidos"', () => {
    expect(candidates).toMatch(/buildMealItemFoods/)
    expect(candidates).toMatch(/mergeCandidates\(mealFoods,/)
  })

  it('a troca manual usa o contexto de refeição', () => {
    expect(swapRoute).toMatch(/mealGroup: mealGroupOf\(meal\.name\)/)
    expect(swapRoute).toMatch(/foodMealMap/)
  })

  it('a geração da SEMANA também — senão a variação recria o problema', () => {
    expect(weekRoute).toMatch(/buildUserFoodMealMap/)
    expect(weekRoute).toMatch(/buildWeekFromDay\(baseMeals, candidates, foodMealMap\)/)
  })
})

/**
 * Refinamentos vindos da AUDITORIA contra o histórico real (04/08/2026): rodei o
 * motor em 132 itens de 60 refeições reais e li as sugestões uma a uma. Os filtros
 * mecânicos diziam "0 problemas"; a leitura mostrou trocas que ninguém faria.
 */
describe('auditoria contra dados reais — o que macro dominante sozinho errava', () => {
  it('bife é PROTEÍNA, não gordura — senão vira ovo, azeite ou maionese', () => {
    // Bife 26 P / 15 G: a gordura domina as calorias, mas o papel no prato é proteína.
    expect(classifyFood({ kcal: 250, protein: 26, carbs: 0, fat: 15 })).toBe('protein')
    expect(classifyFood({ kcal: 155, protein: 13, carbs: 1.1, fat: 11 })).toBe('protein') // ovo
  })

  it('condimento e óleo continuam gordura — a regra da proteína não os captura', () => {
    expect(classifyFood({ kcal: 884, protein: 0, carbs: 0, fat: 100 })).toBe('fat')
    expect(classifyFood({ kcal: 300, protein: 1, carbs: 3, fat: 32 })).toBe('fat') // maionese
  })

  it('leite desnatado NÃO é fruta/verdura — virava substituto de mamão e feijão', () => {
    expect(classifyFood({ kcal: 35, protein: 3.4, carbs: 5, fat: 0.1 })).not.toBe('produce')
  })

  it('alface e brócolis seguem sendo produce — o corte separa os dois casos', () => {
    expect(classifyFood({ kcal: 15, protein: 1.4, carbs: 2.9, fat: 0.2 })).toBe('produce')
    expect(classifyFood({ kcal: 34, protein: 2.8, carbs: 7, fat: 0.4 })).toBe('produce')
  })

  it('item sem papel claro (`mixed`) NÃO é trocado — recusar é melhor que chutar', () => {
    // "arroz" com macros mal parseados (16 P e 11 G em 150 g) caiu em mixed e foi
    // trocado por "orange chicken". Sem saber o papel, não há substituto seguro.
    // Calibrado pra cair mesmo em `mixed`: nenhum macro atinge o limiar da sua
    // classe (P 25%, C 43%, G 32% das calorias) e a proteína fica abaixo do piso.
    const confuso = { food: 'prato misto', grams: 150, calories: 211, protein: 13.5, carbs: 22.5, fat: 7.5 }
    expect(classifyFood(macrosPer100g(confuso))).toBe('mixed')
    // Candidato TAMBÉM mixed: sem a regra, a troca aconteceria (o pool não estaria
    // vazio). Com candidatos de outra classe o teste passaria pelos dois caminhos e
    // não provaria nada — foi assim que este guard nasceu falso.
    const outroMisto = cand('feijoada leve', 141, 9, 15, 5)
    expect(classifyFood(outroMisto)).toBe('mixed')
    expect(swapFood(confuso, [outroMisto])).toBeNull()
  })

  it('gordura não troca por doce: maionese não vira bolo de chocolate', () => {
    const maionese = { food: 'maionese light', grams: 30, calories: 90, protein: 0.3, carbs: 1, fat: 9.6 }
    // Doce cremoso calibrado pra ENTRAR no pool: classifica como `fat` (73% das
    // kcal) e tem desvio calórico dentro do teto (31%), então só a regra do
    // carboidrato o barra. Com um requeijão junto, o teste não provaria nada — o
    // requeijão venceria pelo desvio menor e a regra ficaria sem exercício (foi
    // assim que este guard nasceu falso).
    const doceCremoso = cand('doce cremoso', 370, 0, 25, 30)
    expect(classifyFood(doceCremoso)).toBe('fat')
    expect(swapFood(maionese, [doceCremoso])).toBeNull()

    // E o substituto legítimo de gordura continua passando.
    const requeijao = cand('requeijao', 257, 7, 3, 25)
    expect(swapFood(maionese, [doceCremoso, requeijao])?.food).toBe('requeijao')
  })

  it('porção que encosta no limite é recusada — sinal de casamento ruim', () => {
    // "Choco Biscuit → 1000 g de leite" saía do clamp, não de uma conta que fechou.
    const biscoito = { food: 'choco biscuit', grams: 78, calories: 390, protein: 5, carbs: 60, fat: 14 }
    const leiteRalo = cand('leite desnatado', 35, 3.4, 5, 0.1)
    expect(swapFood(biscoito, [leiteRalo])).toBeNull()
  })
})
