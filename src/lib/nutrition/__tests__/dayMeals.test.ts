/**
 * As refeições de um dia — o núcleo puro do detalhe do histórico.
 *
 * Os dois casos que importam aqui são de FUSO, e os dois já quebraram este app
 * em outras superfícies: o dia sair de `created_at` (treino das 22h no dia
 * seguinte, streak errado em 36 de 633 sessões) e a hora sair sem `timeZone`
 * (o café da manhã impresso às 11h num servidor em UTC).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  groupMealsByDay,
  horaBrt,
  normalizeMealRows,
  resumoItens,
  rotuloItem,
  type NutritionMealRow,
} from '@/lib/nutrition/dayMeals'

describe('hora da refeição', () => {
  /**
   * ⚠️ Este caso só REPROVA onde o runner não está em BRT — no CI, que roda em
   * UTC. Na máquina do dono (São Paulo) ele passa verde mesmo sem o `timeZone`,
   * porque o padrão do processo já é o fuso certo. Medido ao provar por
   * mutação: remover `timeZone: FUSO` deixou os 14 casos verdes localmente.
   *
   * Forçar `process.env.TZ` no topo do arquivo NÃO resolve: o worker do Vitest
   * já subiu e o Node cacheia o fuso na primeira formatação (testado, sem
   * efeito). Quem fecha o buraco localmente é o source-guard abaixo — os dois
   * juntos cobrem as duas máquinas.
   */
  it('sai em BRT, não no fuso de quem lê', () => {
    // 21:05Z é 18:05 em São Paulo (UTC−3).
    expect(horaBrt('2026-08-14T21:05:00Z')).toBe('18:05')
    expect(horaBrt('2026-08-14T13:20:00Z')).toBe('10:20')
  })

  it('o formatador DECLARA o fuso — hora sem `timeZone` é a hora de quem lê', () => {
    const fonte = readFileSync(join(process.cwd(), 'src/lib/nutrition/dayMeals.ts'), 'utf8')
    // Fatia o corpo de `horaBrt` pela CHAMADA, não pelo nome solto: com o nome,
    // a linha de export e as menções em comentário arrastariam o arquivo todo.
    const i = fonte.indexOf('export function horaBrt')
    expect(i, 'a função mudou de nome — atualize o guard, não o apague').toBeGreaterThan(-1)
    const corpo = fonte.slice(i, fonte.indexOf('\nfunction parseItens', i))
    const semComentario = corpo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
    expect(semComentario).toMatch(/Intl\.DateTimeFormat\(/)
    expect(semComentario, 'sem timeZone o relatório impresso num servidor em UTC diz que o café foi às 11h')
      .toMatch(/timeZone:\s*FUSO/)
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

  it('lê os alimentos do jsonb, com os macros de cada um, e ignora entrada sem rótulo', () => {
    const [m] = normalizeMealRows([linha({
      items: [
        { label: 'arroz branco', grams: 250, calories: 320, protein: 6, carbs: 70, fat: 1 },
        { label: '', grams: 10 },
        'lixo',
      ],
    })])
    expect(m.itens).toEqual([
      { label: 'arroz branco', grams: 250, calories: 320, protein: 6, carbs: 70, fat: 1 },
    ])
  })

  it('entrada nula não explode', () => {
    expect(normalizeMealRows(null)).toEqual([])
    expect(normalizeMealRows(undefined)).toEqual([])
  })
})

describe('rotuloItem', () => {
  const item = (over: Partial<{ label: string; grams: number }>) => ({
    label: 'arroz branco', grams: 250, calories: 0, protein: 0, carbs: 0, fat: 0, ...over,
  })

  it('põe a quantidade na frente do alimento', () => {
    expect(rotuloItem(item({}))).toBe('250g arroz branco')
  })

  /**
   * O resolvedor local grava o rótulo COM a quantidade ("150g arroz"). Prefixar
   * de novo produziria "150g 150g arroz" — e os dois formatos convivem no
   * banco, porque só os lançamentos novos passam pela IA.
   */
  it('não repete a quantidade quando o rótulo já a traz', () => {
    expect(rotuloItem(item({ label: '150g arroz', grams: 150 }))).toBe('150g arroz')
    expect(rotuloItem(item({ label: '2 ovos', grams: 100 }))).toBe('2 ovos')
  })

  it('sem gramas conhecidas, sai só o nome — inventar 100g seria afirmar uma medição', () => {
    expect(rotuloItem(item({ grams: 0 }))).toBe('arroz branco')
  })

  it('rótulo vazio não vira linha', () => {
    expect(rotuloItem(item({ label: '   ' }))).toBe('')
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
