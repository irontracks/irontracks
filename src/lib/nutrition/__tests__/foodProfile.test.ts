import { describe, it, expect } from 'vitest'
import { profileFromMealRows, foodProfileToPromptSections, mealLabelOf } from '../food-profile'

/**
 * Amostra REAL da conta do dono (`nutrition_meal_entries`, 04/08/2026). Ela é o
 * contraexemplo inteiro em quatro linhas: o `food_name` é o nome da REFEIÇÃO — era
 * ele que ia para o prompt como se fosse alimento, e por frequência dominava a
 * lista ("Almoço" 36×, "Pós treino" 21×, "Janta" 19×…). Os alimentos de verdade
 * sempre estiveram em `items`.
 */
const rowsReais = [
  {
    food_name: 'Almoço',
    items: [
      { label: '150g arroz branco', grams: 150, calories: 195, protein: 4, carbs: 42, fat: 1 },
      { label: '200g patinho moído', grams: 200, calories: 320, protein: 44, carbs: 0, fat: 16 },
    ],
  },
  {
    food_name: 'Café da manhã',
    items: [
      { label: '100g de sucrilhos', grams: 100, calories: 380, protein: 7, carbs: 84, fat: 1 },
      { label: '250ml leite desnatado', grams: 250, calories: 88, protein: 9, carbs: 12, fat: 1 },
    ],
  },
  {
    food_name: 'Janta',
    items: [{ label: '150g arroz branco', grams: 150, calories: 195, protein: 4, carbs: 42, fat: 1 }],
  },
  {
    // O caso que quebrava a troca e o cardápio: composto e densidade impossível.
    food_name: 'Lanche da tarde',
    items: [
      { label: '125g Pão Francês com Doce de Leite', grams: 125, calories: 376, protein: 8, carbs: 62, fat: 10 },
      { label: '100g Refeição de Arroz, Strogonoff e Batata Palha', grams: 100, calories: 1070, protein: 30, carbs: 90, fat: 60 },
      // Existe DE VERDADE como label de item na base do dono (2×): quando o parser
      // não consegue quebrar o texto, o item herda o nome da refeição. Densidade
      // plausível — só o crivo de rótulo o barra.
      { label: 'Refeição Completa', grams: 400, calories: 932, protein: 45, carbs: 100, fat: 35 },
      { label: 'Almoço', grams: 500, calories: 700, protein: 40, carbs: 80, fat: 20 },
    ],
  },
]

describe('o repertório sai dos ITENS, nunca do nome da refeição', () => {
  const profile = profileFromMealRows(rowsReais)
  const nomes = profile.topFoods.map((f) => f.name.toLowerCase())

  it('nenhum rótulo de refeição entra como alimento', () => {
    for (const rotulo of ['almoço', 'almoco', 'café da manhã', 'cafe da manha', 'janta', 'lanche da tarde', 'ceia', 'pós treino', 'refeição']) {
      expect(nomes).not.toContain(rotulo)
    }
  })

  it('os alimentos de verdade entram, sem a quantidade no nome', () => {
    expect(nomes).toContain('arroz branco')
    expect(nomes).toContain('patinho moído')
    expect(nomes).toContain('leite desnatado')
  })

  it('composto e densidade impossível são barrados (mesmo crivo do motor de troca)', () => {
    expect(nomes.some((n) => n.includes('pão francês com doce'))).toBe(false)
    expect(nomes.some((n) => n.includes('strogonoff'))).toBe(false)
  })

  it('conta a frequência real: arroz aparece em duas refeições', () => {
    expect(profile.topFoods.find((f) => f.name.toLowerCase() === 'arroz branco')?.count).toBe(2)
  })
})

describe('cada alimento carrega EM QUE refeição o usuário o come', () => {
  const profile = profileFromMealRows(rowsReais)

  it('arroz é comida de almoço e jantar', () => {
    const arroz = profile.topFoods.find((f) => f.name.toLowerCase() === 'arroz branco')
    expect(arroz?.meals).toEqual(expect.arrayContaining(['Almoço', 'Jantar']))
  })

  it('sucrilhos é café da manhã — nunca almoço', () => {
    const sucrilhos = profile.topFoods.find((f) => f.name.toLowerCase().includes('sucrilhos'))
    expect(sucrilhos?.meals).toEqual(['Café da manhã'])
  })

  it('o texto do prompt sai agrupado por refeição', () => {
    const sections = foodProfileToPromptSections(profile)
    expect(sections).toContain('- Almoço: ')
    expect(sections).toContain('- Café da manhã: ')
    // É essa linha que impede pão com doce de leite de cair no almoço.
    expect(sections).toMatch(/- Café da manhã:[^\n]*sucrilhos/i)
    expect(sections).not.toMatch(/- Almoço:[^\n]*sucrilhos/i)
  })
})

describe('rótulo canônico da refeição — o usuário digita de tudo', () => {
  it.each([
    ['Café da manhã', 'Café da manhã'],
    ['Café da manha', 'Café da manhã'],
    ['Almoço', 'Almoço'],
    ['Janta', 'Jantar'],
    ['Jantar', 'Jantar'],
    ['Ceia', 'Ceia'],
    ['Café da tarde', 'Lanche da tarde'],
    ['Lache', 'Lanche da tarde'],
    ['Pós treino', 'Pós-treino'],
    ['Pré treino', 'Pré-treino'],
  ])('%s → %s', (digitado, esperado) => expect(mealLabelOf(digitado)).toBe(esperado))

  it('o específico ganha do genérico em nome com dois sinais', () => {
    expect(mealLabelOf('Café da manhã pós treino')).toBe('Pós-treino')
  })
})

describe('degradação', () => {
  it('sem linhas, perfil vazio e prompt vazio (cai em "alimentos comuns no Brasil")', () => {
    const empty = profileFromMealRows([])
    expect(empty.topFoods).toEqual([])
    expect(foodProfileToPromptSections(empty)).toBe('')
  })

  it('item sem gramas não vira alimento — sem gramas não há macro por 100 g', () => {
    const p = profileFromMealRows([{ food_name: 'Almoço', items: [{ label: 'arroz', grams: 0, calories: 200 }] }])
    expect(p.topFoods).toEqual([])
  })

  it('linha malformada não derruba a extração', () => {
    expect(() => profileFromMealRows([null, 'x', { food_name: 'Almoço', items: null }])).not.toThrow()
  })
})
