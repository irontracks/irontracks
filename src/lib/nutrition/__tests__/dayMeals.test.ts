/**
 * As refeições de um dia — o núcleo puro do detalhe do histórico.
 *
 * Os dois casos que importam aqui são de FUSO, e os dois já quebraram este app
 * em outras superfícies: o dia sair de `created_at` (treino das 22h no dia
 * seguinte, streak errado em 36 de 633 sessões) e a hora sair sem `timeZone`
 * (o café da manhã impresso às 11h num servidor em UTC).
 */
/**
 * ⚠️ Fuso do RUNNER forçado para longe do Brasil.
 *
 * Sem isto, remover o `timeZone` do formatador passa VERDE no Mac do dono (que
 * já está em BRT) e só quebra no CI, que roda em UTC — o guard reprovaria a
 * pessoa errada, no momento errado. Medido: com TZ de Nova York, 21:05Z sai
 * 17:05 sem o `timeZone` e 18:05 com ele.
 */
process.env.TZ = 'America/New_York'

import { describe, it, expect } from 'vitest'
import {
  groupMealsByDay,
  horaBrt,
  normalizeMealRows,
  resumoItens,
  type NutritionMealRow,
} from '@/lib/nutrition/dayMeals'

describe('hora da refeição', () => {
  it('sai em BRT, não no fuso de quem lê', () => {
    // 21:05Z é 18:05 em São Paulo (UTC−3).
    expect(horaBrt('2026-08-14T21:05:00Z')).toBe('18:05')
    expect(horaBrt('2026-08-14T13:20:00Z')).toBe('10:20')
  })

  it('carimbo ruim vira string vazia, nunca "Invalid Date"', () => {
    expect(horaBrt('')).toBe('')
    expect(horaBrt('nao-e-data')).toBe('')
    expect(horaBrt(null)).toBe('')
  })
})

describe('normalizeMealRows', () => {
  const linha = (over: Partial<NutritionMealRow> = {}): NutritionMealRow => ({
    id: 'x', date: '2026-08-14', created_at: '2026-08-14T13:00:00Z',
    food_name: 'Almoço', calories: 800, protein: 60, carbs: 90, fat: 20, items: [],
    ...over,
  })

  /**
   * O CASO DA VIRADA: uma refeição das 23h30 em São Paulo tem `created_at` no
   * dia SEGUINTE em UTC. O dia tem que sair da coluna `date` — derivá-lo do
   * carimbo jogaria a ceia no card de amanhã.
   */
  it('o dia vem da coluna `date`, nunca do created_at', () => {
    const [m] = normalizeMealRows([
      linha({ date: '2026-08-14', created_at: '2026-08-15T02:30:00Z' }),
    ])
    expect(m.date).toBe('2026-08-14')
    expect(m.hora).toBe('23:30')
  })

  it('ordena pela hora do lançamento — a manhã antes da noite', () => {
    const nomes = normalizeMealRows([
      linha({ id: 'b', created_at: '2026-08-14T22:00:00Z', food_name: 'Janta' }),
      linha({ id: 'a', created_at: '2026-08-14T11:00:00Z', food_name: 'Café' }),
    ]).map((m) => m.nome)
    expect(nomes).toEqual(['Café', 'Janta'])
  })

  it('carimbo ruim vai para o fim, mas a refeição NÃO some', () => {
    const nomes = normalizeMealRows([
      linha({ id: 'ruim', created_at: 'zzz', food_name: 'Sem hora' }),
      linha({ id: 'ok', created_at: '2026-08-14T11:00:00Z', food_name: 'Café' }),
    ]).map((m) => m.nome)
    expect(nomes).toEqual(['Café', 'Sem hora'])
  })

  it('linha sem dia é descartada — ela não pertence a card nenhum', () => {
    expect(normalizeMealRows([linha({ date: null }), linha()])).toHaveLength(1)
  })

  it('refeição sem nome ganha um rótulo, não vira linha em branco', () => {
    expect(normalizeMealRows([linha({ food_name: '  ' })])[0].nome).toBe('Refeição')
  })

  it('valores não numéricos viram 0 em vez de NaN na tela', () => {
    const [m] = normalizeMealRows([linha({ calories: 'abc', protein: undefined })])
    expect(m.calories).toBe(0)
    expect(m.protein).toBe(0)
  })

  it('lê os alimentos do jsonb e ignora entrada sem rótulo', () => {
    const [m] = normalizeMealRows([linha({
      items: [{ label: '150g arroz', grams: 150 }, { label: '', grams: 10 }, 'lixo'],
    })])
    expect(m.itens).toEqual([{ label: '150g arroz', grams: 150 }])
  })

  it('entrada nula não explode', () => {
    expect(normalizeMealRows(null)).toEqual([])
    expect(normalizeMealRows(undefined)).toEqual([])
  })
})

describe('groupMealsByDay', () => {
  it('agrupa pelo dia BRT, preservando a ordem de cada dia', () => {
    const mapa = groupMealsByDay(normalizeMealRows([
      { id: '1', date: '2026-08-14', created_at: '2026-08-14T11:00:00Z', food_name: 'Café', calories: 1, protein: 0, carbs: 0, fat: 0 },
      { id: '2', date: '2026-08-15', created_at: '2026-08-15T11:00:00Z', food_name: 'Café 2', calories: 1, protein: 0, carbs: 0, fat: 0 },
      { id: '3', date: '2026-08-14', created_at: '2026-08-14T22:00:00Z', food_name: 'Janta', calories: 1, protein: 0, carbs: 0, fat: 0 },
    ]))
    expect(mapa.get('2026-08-14')?.map((m) => m.nome)).toEqual(['Café', 'Janta'])
    expect(mapa.get('2026-08-15')).toHaveLength(1)
  })
})

describe('resumoItens', () => {
  const comItens = (labels: string[]) => normalizeMealRows([{
    id: 'x', date: '2026-08-14', created_at: '2026-08-14T11:00:00Z', food_name: 'Almoço',
    calories: 0, protein: 0, carbs: 0, fat: 0,
    items: labels.map((label) => ({ label, grams: 100 })),
  }])[0]

  it('junta os alimentos numa linha só', () => {
    expect(resumoItens(comItens(['150g arroz', '200g patinho']))).toBe('150g arroz · 200g patinho')
  })

  it('acima do teto, conta o resto em vez de cortar em silêncio', () => {
    expect(resumoItens(comItens(['a', 'b', 'c', 'd', 'e', 'f']), 4)).toBe('a · b · c · d +2')
  })

  it('refeição sem alimento devolve vazio — nada a mostrar', () => {
    expect(resumoItens(comItens([]))).toBe('')
  })
})
