/**
 * Guards do horário das refeições do plano.
 *
 * O caso que mais importa é o do CICLO: a rota grava regravando o plano a partir
 * de `planDays()`, e esse parser reconstrói cada refeição campo a campo. Campo
 * que ele não declara não some só da tela — é APAGADO do banco na primeira
 * gravação. Já aconteceu aqui com a observação da refeição (31/08/2026).
 */
import { describe, it, expect } from 'vitest'
import { planDays, type PlanDay } from '../dietPlanShape'
import {
  aplicarHorarios,
  horariosDoPlano,
  minutosDoDia,
  normalizarHorario,
  resumoDaRefeicao,
} from '../mealTimes'

const item = (food: string, grams: number, calories: number) => ({
  food, grams, calories, protein: 0, carbs: 0, fat: 0,
})

const refeicao = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  items: [item('arroz', 150, 200)],
  totals: { calories: 200, protein: 0, carbs: 0, fat: 0 },
  ...extra,
})

/** Semana com as MESMAS três refeições nos sete dias — o formato real da base. */
const semana = (): PlanDay[] =>
  Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    meals: [refeicao('Café da manhã'), refeicao('Almoço'), refeicao('Jantar')],
    totals: { calories: 600, protein: 0, carbs: 0, fat: 0 },
  })) as PlanDay[]

describe('normalizarHorario', () => {
  it('aceita HH:MM e completa o zero à esquerda', () => {
    expect(normalizarHorario('07:00')).toBe('07:00')
    expect(normalizarHorario('7:05')).toBe('07:05')
    expect(normalizarHorario(' 23:59 ')).toBe('23:59')
    expect(normalizarHorario('00:00')).toBe('00:00')
  })

  it('recusa o que não é hora — horário inválido vira lembrete que nunca dispara', () => {
    for (const v of ['24:00', '12:60', '7', '7h', 'meio-dia', '12:5', '', null, undefined, 700]) {
      expect(normalizarHorario(v), String(v)).toBe('')
    }
  })
})

describe('minutosDoDia', () => {
  it('converte para minuto do dia', () => {
    expect(minutosDoDia('00:00')).toBe(0)
    expect(minutosDoDia('07:30')).toBe(450)
    expect(minutosDoDia('23:59')).toBe(1439)
  })
  it('devolve null no horário inválido, nunca 0', () => {
    // 0 é meia-noite VÁLIDA: confundir os dois faria toda refeição sem horário
    // disparar às 00:00.
    expect(minutosDoDia('xx')).toBeNull()
    expect(minutosDoDia('')).toBeNull()
  })
})

describe('aplicarHorarios — a unidade é o NOME, e vale a semana', () => {
  it('um horário por nome atinge os SETE dias', () => {
    const dias = aplicarHorarios(semana(), { Almoço: '12:00' })
    expect(dias).toHaveLength(7)
    for (const dia of dias) {
      expect(dia.meals.find((m) => m.name === 'Almoço')?.time).toBe('12:00')
    }
  })

  it('não encosta nas outras refeições', () => {
    const dias = aplicarHorarios(semana(), { Almoço: '12:00' })
    for (const dia of dias) {
      expect(dia.meals.find((m) => m.name === 'Jantar')?.time).toBeUndefined()
    }
  })

  it('vazio APAGA a chave — é como o usuário desfaz', () => {
    const comHorario = aplicarHorarios(semana(), { Almoço: '12:00' })
    const semHorario = aplicarHorarios(comHorario, { Almoço: '' })
    for (const dia of semHorario) {
      const almoco = dia.meals.find((m) => m.name === 'Almoço')
      expect(almoco).toBeDefined()
      expect('time' in (almoco as object)).toBe(false)
    }
  })

  it('nome AUSENTE do mapa fica intocado', () => {
    // O editor manda o que ele mostrou. Uma refeição que ele não conhece (plano
    // alterado noutra aba) não pode perder o horário por omissão.
    const base = aplicarHorarios(semana(), { Jantar: '19:30' })
    const depois = aplicarHorarios(base, { Almoço: '12:00' })
    for (const dia of depois) {
      expect(dia.meals.find((m) => m.name === 'Jantar')?.time).toBe('19:30')
    }
  })

  it('horário inválido não entra no plano', () => {
    const dias = aplicarHorarios(semana(), { Almoço: '25:00' })
    for (const dia of dias) {
      expect(dia.meals.find((m) => m.name === 'Almoço')?.time).toBeUndefined()
    }
  })
})

describe('horariosDoPlano — o que o editor mostra', () => {
  it('devolve os nomes distintos, na ordem em que aparecem', () => {
    expect(horariosDoPlano(semana()).map((l) => l.nome)).toEqual(['Café da manhã', 'Almoço', 'Jantar'])
  })

  it('traz o horário já gravado', () => {
    const dias = aplicarHorarios(semana(), { 'Café da manhã': '07:00', Almoço: '12:00' })
    expect(horariosDoPlano(dias)).toEqual([
      { nome: 'Café da manhã', time: '07:00' },
      { nome: 'Almoço', time: '12:00' },
      { nome: 'Jantar', time: '' },
    ])
  })

  it('acha o horário mesmo quando só um dia o tem', () => {
    const dias = semana()
    dias[3] = { ...dias[3], meals: dias[3].meals.map((m) => (m.name === 'Jantar' ? { ...m, time: '20:00' } : m)) }
    expect(horariosDoPlano(dias).find((l) => l.nome === 'Jantar')?.time).toBe('20:00')
  })
})

describe('⚠️ CICLO ler → regravar → ler (a armadilha do planDays)', () => {
  it('semana: o horário sobrevive à releitura, junto com nota e itens', () => {
    const dias = aplicarHorarios(
      semana().map((d) => ({
        ...d,
        meals: d.meals.map((m) => (m.name === 'Almoço' ? { ...m, note: 'sem sal' } : m)),
      })),
      { Almoço: '12:00' },
    )
    // Exatamente o que a rota grava, e o que a leitura seguinte devolve.
    const regravado = planDays({ days: dias.map((d) => ({ weekday: d.weekday, meals: d.meals })) })
    const almoco = regravado[0]?.meals.find((m) => m.name === 'Almoço')
    expect(almoco?.time).toBe('12:00')
    expect(almoco?.note).toBe('sem sal')
    expect(almoco?.items).toHaveLength(1)
    expect(regravado).toHaveLength(7)
  })

  it('plano de UM dia: o formato não vira semana', () => {
    const um: PlanDay[] = [{ meals: [refeicao('Almoço')], totals: { calories: 200, protein: 0, carbs: 0, fat: 0 } }]
    const dias = aplicarHorarios(um, { Almoço: '12:00' })
    const regravado = planDays({ meals: dias[0]?.meals ?? [] })
    expect(regravado).toHaveLength(1)
    expect(regravado[0]?.meals[0]?.time).toBe('12:00')
  })
})

describe('resumoDaRefeicao — o corpo do push diz o que comer', () => {
  it('lista os alimentos com as gramas e fecha com a kcal', () => {
    const meal = {
      name: 'Almoço',
      items: [item('arroz', 150, 200), item('patinho', 200, 300)],
      totals: { calories: 500, protein: 0, carbs: 0, fat: 0 },
    }
    expect(resumoDaRefeicao(meal)).toBe('150g arroz, 200g patinho · 500 kcal')
  })

  it('corta por ITEM e diz quantos ficaram de fora', () => {
    const meal = {
      name: 'Almoço',
      items: Array.from({ length: 12 }, (_, i) => item(`alimento bem comprido numero ${i}`, 100, 50)),
      totals: { calories: 600, protein: 0, carbs: 0, fat: 0 },
    }
    const texto = resumoDaRefeicao(meal)
    expect(texto.length).toBeLessThanOrEqual(140)
    expect(texto).toMatch(/\+\d+ · 600 kcal$/)
    // "100g alimento bem comp…" seria pior que dizer quantos sobraram.
    expect(texto).not.toContain('…')
  })

  it('refeição sem item ainda diz alguma coisa', () => {
    expect(resumoDaRefeicao({ name: 'Ceia', items: [], totals: { calories: 0, protein: 0, carbs: 0, fat: 0 } }))
      .toBeTruthy()
  })
})
