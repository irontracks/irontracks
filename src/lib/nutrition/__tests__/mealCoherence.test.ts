import { describe, it, expect } from 'vitest'
import {
  isLiquidVehicle,
  requiredVehicle,
  isConcentratedSweet,
  missingVehicleOf,
  findCoherenceIssues,
  repairMissingVehicles,
  MAX_SWEETS_PER_DAY,
} from '../mealCoherence'

/**
 * Os casos abaixo são o cardápio REAL que o gerador entregou ao dono em 04/08/2026
 * (plano "Plano Alimentar Cardioprotetor", `student_diet_plans`), e que ele reportou
 * com a pergunta certa: "como comer isso tudo sem um leite?".
 */
const cafeDaManhaReal = {
  name: 'Café da Manhã',
  time: '07:30',
  items: [
    { food: 'biscoito de arroz', grams: 85, calories: 330, protein: 7, carbs: 70, fat: 3 },
    { food: 'Doce de Leite', grams: 40, calories: 125, protein: 2, carbs: 22, fat: 3 },
    { food: 'Whey Protein Growth', grams: 30, calories: 120, protein: 24, carbs: 3, fat: 2 },
    { food: 'Aveia em Flocos Inteiros (Fibras)', grams: 40, calories: 155, protein: 5, carbs: 26, fat: 3 },
  ],
}

const ceiaReal = {
  name: 'Ceia',
  time: '22:30',
  items: [
    { food: 'Whey Protein Growth (Dose Extra)', grams: 50, calories: 200, protein: 40, carbs: 5, fat: 3 },
    { food: 'Semente de Linhaça Dourada Moída (Ômega-3)', grams: 15, calories: 80, protein: 3, carbs: 4, fat: 6 },
    { food: 'Abacate', grams: 100, calories: 96, protein: 1, carbs: 6, fat: 8 },
    { food: 'Creatina', grams: 5, calories: 0, protein: 0, carbs: 0, fat: 0 },
  ],
}

describe('veículo — o que é líquido e o que só parece', () => {
  it.each(['Leite desnatado', 'Iogurte natural', 'Água', 'Café preto', 'Suco de laranja'])(
    '%s serve de veículo',
    (food) => expect(isLiquidVehicle(food)).toBe(true),
  )

  // A armadilha central: os três casam com /leite/ e NÃO molham nada. Sem estas
  // exclusões o café da manhã real passaria como se já tivesse líquido.
  it.each(['Doce de Leite', 'Leite Condensado (lata inteira, 395g)', 'Leite em pó'])(
    '%s NÃO serve de veículo',
    (food) => expect(isLiquidVehicle(food)).toBe(false),
  )

  it('whey e creatina dissolvem em qualquer líquido', () => {
    expect(requiredVehicle('Whey Protein Growth')).toBe('any')
    expect(requiredVehicle('Creatina')).toBe('any')
  })

  it('aveia e sucrilhos exigem base cremosa', () => {
    expect(requiredVehicle('Aveia em Flocos Inteiros (Fibras)')).toBe('creamy')
    expect(requiredVehicle('Sucrilhos')).toBe('creamy')
  })

  it('alimento comum não exige veículo nenhum', () => {
    expect(requiredVehicle('Peito de frango grelhado')).toBeNull()
    expect(requiredVehicle('Arroz branco cozido')).toBeNull()
  })

  it('bebida pronta não é tratada como pó ("shake de whey" já vem com líquido)', () => {
    expect(requiredVehicle('Shake de whey com leite')).toBeNull()
  })
})

describe('o cardápio real reprovado', () => {
  it('o café da manhã do dono cai como refeição sem líquido, exigindo o cremoso', () => {
    const missing = missingVehicleOf(cafeDaManhaReal)
    expect(missing).not.toBeNull()
    // aveia (creamy) manda sobre whey (any): um copo de leite resolve os dois.
    expect(missing?.vehicle).toBe('creamy')
    expect(missing?.foods).toHaveLength(2)
  })

  it('a ceia do dono também cai — whey e creatina secos', () => {
    expect(missingVehicleOf(ceiaReal)?.vehicle).toBe('any')
  })

  it('a mesma refeição COM leite passa', () => {
    const comLeite = {
      ...cafeDaManhaReal,
      items: [...cafeDaManhaReal.items, { food: 'Leite desnatado', grams: 200, calories: 70, protein: 7, carbs: 10, fat: 1 }],
    }
    expect(missingVehicleOf(comLeite)).toBeNull()
  })
})

describe('doce concentrado', () => {
  it.each(['Doce de Leite', 'Leite Condensado', 'Mel', 'Chocolate ao leite', 'Geleia de morango'])(
    '%s é doce concentrado',
    (food) => expect(isConcentratedSweet(food)).toBe(true),
  )

  it('banana e batata-doce NÃO são doce concentrado', () => {
    expect(isConcentratedSweet('Banana prata')).toBe(false)
    expect(isConcentratedSweet('Batata doce cozida')).toBe(false)
  })

  it('dois doces na mesma refeição são reprovados', () => {
    const meal = {
      name: 'Café da Manhã',
      items: [
        { food: 'Leite Condensado', grams: 25, calories: 80, protein: 2, carbs: 14, fat: 2 },
        { food: 'Doce de Leite', grams: 40, calories: 125, protein: 2, carbs: 22, fat: 3 },
        { food: 'Leite desnatado', grams: 200, calories: 70, protein: 7, carbs: 10, fat: 1 },
      ],
    }
    expect(findCoherenceIssues([meal]).some((i) => i.kind === 'sweet_overload')).toBe(true)
  })

  it('doce que domina as calorias da refeição é reprovado como base', () => {
    const meal = {
      name: 'Café da Manhã',
      items: [
        { food: 'Doce de Leite', grams: 100, calories: 300, protein: 5, carbs: 55, fat: 7 },
        { food: 'Leite desnatado', grams: 200, calories: 70, protein: 7, carbs: 10, fat: 1 },
      ],
    }
    expect(findCoherenceIssues([meal]).some((i) => i.kind === 'sweet_as_base')).toBe(true)
  })

  it(`mais de ${MAX_SWEETS_PER_DAY} doce no dia é reprovado mesmo espalhado`, () => {
    const meal = (food: string) => ({
      name: 'Lanche',
      items: [
        { food, grams: 20, calories: 60, protein: 1, carbs: 12, fat: 1 },
        { food: 'Pão integral', grams: 50, calories: 130, protein: 5, carbs: 24, fat: 2 },
      ],
    })
    const issues = findCoherenceIssues([meal('Mel'), meal('Geleia')])
    expect(issues.some((i) => i.mealIndex === -1 && i.kind === 'sweet_overload')).toBe(true)
  })
})

describe('reparo — acrescenta o líquido, nunca amputa o prato', () => {
  it('o café da manhã real ganha leite desnatado', () => {
    const { meals, repaired } = repairMissingVehicles([cafeDaManhaReal])
    expect(repaired).toBe(1)
    expect(meals[0]!.items).toHaveLength(cafeDaManhaReal.items.length + 1)
    expect(meals[0]!.items.at(-1)!.food).toBe('Leite desnatado')
  })

  it('a ceia ganha água — zero caloria, não desloca o plano da meta', () => {
    const { meals } = repairMissingVehicles([ceiaReal])
    const added = meals[0]!.items.at(-1)!
    expect(added.food).toBe('Água')
    expect(added.calories).toBe(0)
  })

  it('não remove nem altera item nenhum do prato original', () => {
    const { meals } = repairMissingVehicles([cafeDaManhaReal])
    expect(meals[0]!.items.slice(0, 4)).toEqual(cafeDaManhaReal.items)
  })

  it('refeição já coerente passa intacta e não conta reparo', () => {
    const meal = {
      name: 'Almoço',
      items: [{ food: 'Arroz branco cozido', grams: 200, calories: 250, protein: 5, carbs: 55, fat: 1 }],
    }
    const { meals, repaired } = repairMissingVehicles([meal])
    expect(repaired).toBe(0)
    expect(meals[0]).toBe(meal)
  })

  it('não muta a entrada', () => {
    const original = JSON.parse(JSON.stringify(cafeDaManhaReal))
    repairMissingVehicles([cafeDaManhaReal])
    expect(cafeDaManhaReal).toEqual(original)
  })
})
