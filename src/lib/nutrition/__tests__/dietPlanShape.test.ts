import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  isOwnPlan,
  planDailyAverage,
  planDays,
  planKindOf,
  planTotals,
  weekdayLabel,
} from '../dietPlanShape'

/**
 * A dieta gerada era EFÊMERA (03/08/2026): gerava, mostrava e sumia ao fechar a
 * tela. Só o professor tinha persistência. Agora o usuário salva a própria, na
 * MESMA tabela — separados por `created_by`.
 *
 * `planDays` existe pra não haver dois caminhos entre plano de dia (`meals`, como
 * o professor já grava) e plano de semana (`days`). Neste repo, família de irmãos
 * que se copiam diverge em silêncio — foi assim com os 14 renderers de série.
 */

const meal = (name: string, items: Array<[string, number, number, number, number, number]>) => ({
  name,
  items: items.map(([food, grams, calories, protein, carbs, fat]) => ({ food, grams, calories, protein, carbs, fat })),
})

const CAFE = meal('Café da Manhã', [
  ['Pão Francês', 100, 270, 9, 57, 1],
  ['Clara de Ovo', 150, 78, 17, 1, 0],
])
const ALMOCO = meal('Almoço', [['Frango', 200, 330, 62, 0, 8]])

describe('planDays — um formato só pra quem lê', () => {
  it('plano de DIA (meals) vira uma lista de um elemento', () => {
    const days = planDays({ meals: [CAFE, ALMOCO] })
    expect(days).toHaveLength(1)
    expect(days[0].meals.map((m) => m.name)).toEqual(['Café da Manhã', 'Almoço'])
    expect(days[0].weekday).toBeUndefined()
  })

  it('plano de SEMANA (days) devolve um elemento por dia, com o dia da semana', () => {
    const days = planDays({ days: [{ weekday: 1, meals: [CAFE] }, { weekday: 2, meals: [ALMOCO] }] })
    expect(days).toHaveLength(2)
    expect(days.map((d) => d.weekday)).toEqual([1, 2])
  })

  it('`days` preenchido ganha de `meals` — semana é o formato mais específico', () => {
    const days = planDays({ meals: [CAFE], days: [{ weekday: 0, meals: [ALMOCO] }] })
    expect(days).toHaveLength(1)
    expect(days[0].meals[0].name).toBe('Almoço')
  })

  it('linha vazia, nula ou corrompida devolve lista vazia em vez de quebrar a tela', () => {
    expect(planDays(null)).toEqual([])
    expect(planDays(undefined)).toEqual([])
    expect(planDays({})).toEqual([])
    expect(planDays({ meals: 'nao e array' as unknown })).toEqual([])
    expect(planDays({ days: [{ meals: [] }] })).toEqual([])
  })

  it('item sem nome de alimento é descartado (não vira linha fantasma no cardápio)', () => {
    const days = planDays({ meals: [{ name: 'Ceia', items: [{ food: '   ', grams: 10 }, { food: 'Iogurte', grams: 170, calories: 100, protein: 10, carbs: 8, fat: 3 }] }] })
    expect(days[0].meals[0].items.map((i) => i.food)).toEqual(['Iogurte'])
  })

  it('weekday fora de 0..6 é ignorado em vez de virar rótulo inválido', () => {
    const days = planDays({ days: [{ weekday: 9, meals: [CAFE] }] })
    expect(days[0].weekday).toBeUndefined()
    expect(weekdayLabel(days[0].weekday)).toBe('Dia')
    expect(weekdayLabel(1)).toBe('Segunda')
  })
})

describe('totais — sempre recomputados, nunca lidos do que veio gravado', () => {
  it('o total da refeição sai dos ITENS, mesmo se vier um total mentiroso no jsonb', () => {
    // Trocar um alimento muda o item; um total gravado junto viraria mentira
    // silenciosa na próxima leitura.
    const days = planDays({ meals: [{ ...CAFE, totals: { calories: 99999, protein: 0, carbs: 0, fat: 0 } }] })
    expect(days[0].meals[0].totals.calories).toBe(348)
    expect(days[0].meals[0].totals.protein).toBe(26)
  })

  it('total do plano soma os dias', () => {
    const row = { days: [{ weekday: 1, meals: [CAFE] }, { weekday: 2, meals: [CAFE] }] }
    expect(planTotals(row).calories).toBe(696)
  })

  it('média diária é o número comparável com a meta — não o total da semana', () => {
    const row = { days: [{ weekday: 1, meals: [CAFE] }, { weekday: 2, meals: [CAFE] }] }
    expect(planDailyAverage(row).calories).toBe(348)
    expect(planDailyAverage({ meals: [CAFE] }).calories).toBe(348)
    expect(planDailyAverage(null)).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 })
  })
})

describe('planKindOf — deriva do CONTEÚDO, não do rótulo gravado', () => {
  it('mais de um dia é semana; um dia é dia', () => {
    expect(planKindOf({ days: [{ meals: [CAFE] }, { meals: [ALMOCO] }] })).toBe('week')
    expect(planKindOf({ meals: [CAFE] })).toBe('day')
  })

  it('`plan_kind` mentindo não engana a leitura', () => {
    // Um plano marcado 'week' com um dia só continua sendo um dia — a UI de semana
    // renderizaria uma navegação de 7 abas com 6 vazias.
    expect(planKindOf({ plan_kind: 'week', meals: [CAFE] })).toBe('day')
  })
})

describe('isOwnPlan — o que separa a minha dieta da prescrita pelo professor', () => {
  const ME = 'user-1'

  it('meu plano é o que tem user_id = created_by = eu', () => {
    expect(isOwnPlan({ user_id: ME, created_by: ME }, ME)).toBe(true)
  })

  it('plano do professor NÃO é meu (fica somente-leitura na tela)', () => {
    expect(isOwnPlan({ user_id: ME, created_by: 'coach-9' }, ME)).toBe(false)
  })

  it('sem usuário logado nada é meu', () => {
    expect(isOwnPlan({ user_id: ME, created_by: ME }, null)).toBe(false)
    expect(isOwnPlan({ user_id: ME, created_by: ME }, '  ')).toBe(false)
  })
})

describe('source-guard: as duas rotas não podem se misturar', () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  const own = strip(readFileSync('src/app/api/nutrition/diet-plan/route.ts', 'utf8'))
  const prescribed = strip(readFileSync('src/app/api/nutrition/prescribed-plan/route.ts', 'utf8'))

  it('a rota do plano PRÓPRIO só enxerga created_by = user', () => {
    expect(own).toMatch(/\.eq\('created_by', userId\)/)
    expect(own).toMatch(/created_by: userId/)
  })

  it('a rota do PRESCRITO exclui o que o usuário salvou sozinho', () => {
    // Sem este neq, a dieta que ele mesmo gerou apareceria como recomendação do
    // professor — e o card de prescrito trava a edição.
    expect(prescribed).toMatch(/\.neq\('created_by', userId\)/)
  })

  it('salvar arquiva o plano próprio anterior — só um ativo por vez', () => {
    expect(own).toMatch(/status: 'archived'/)
    expect(own).toMatch(/\.eq\('status', 'active'\)/)
  })

  it('apagar ARQUIVA, não deleta a linha', () => {
    const del = own.slice(own.indexOf('export async function DELETE'))
    expect(del).toMatch(/status: 'archived'/)
    expect(del).not.toMatch(/\.delete\(\)/)
  })

  it('o corpo aceita dia OU semana, nunca os dois', () => {
    expect(own).toMatch(/Boolean\(b\.meals\) !== Boolean\(b\.days\)/)
  })
})
