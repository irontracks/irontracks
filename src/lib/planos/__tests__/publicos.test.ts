import { describe, expect, it } from 'vitest'
import {
  anualPorMes,
  formatarBRL,
  linhasDoPlano,
  mesesGratis,
  montarPlanos,
  porAluno,
} from '../publicos'
import { APP_PLANS, TEACHER_TIERS } from './fixtures'

const nbsp = (s: string) => s.replace(/ /g, ' ')

describe('formatarBRL', () => {
  it('formata em reais com vírgula', () => {
    expect(nbsp(formatarBRL(2990))).toBe('R$ 29,90')
    expect(nbsp(formatarBRL(9990))).toBe('R$ 99,90')
  })

  it('valor redondo perde os centavos só quando pedido', () => {
    expect(nbsp(formatarBRL(29900, true))).toBe('R$ 299')
    expect(nbsp(formatarBRL(29900))).toBe('R$ 299,00')
    // com centavos de verdade, o modo "inteiro" NÃO arredonda
    expect(nbsp(formatarBRL(2990, true))).toBe('R$ 29,90')
  })
})

describe('mesesGratis / anualPorMes', () => {
  it('10 meses de preço = 2 meses grátis', () => {
    expect(mesesGratis(2990, 29900)).toBe(2)
    expect(mesesGratis(5990, 59900)).toBe(2)
  })

  it('anual sem desconto real não anuncia mês grátis', () => {
    expect(mesesGratis(2990, 2990 * 12)).toBe(0)
    expect(mesesGratis(2990, null)).toBe(0)
    expect(mesesGratis(0, 29900)).toBe(0)
  })

  it('equivalente mensal arredonda ao centavo', () => {
    expect(anualPorMes(29900)).toBe(2492) // 24,9166… → 24,92
  })
})

describe('linhasDoPlano — sai dos limites que o app aplica', () => {
  const start = linhasDoPlano(APP_PLANS[0].limits)
  const pro = linhasDoPlano(APP_PLANS[2].limits)
  const elite = linhasDoPlano(APP_PLANS[4].limits)
  const por = (r: typeof start, rotulo: string) => r.linhas.find((l) => l.rotulo === rotulo)!

  it('os três planos têm as MESMAS linhas, na mesma ordem', () => {
    const rotulos = (r: typeof start) => r.linhas.map((l) => l.rotulo)
    expect(rotulos(pro)).toEqual(rotulos(start))
    expect(rotulos(elite)).toEqual(rotulos(start))
  })

  it('números viram texto legível; 9999 vira Ilimitado com asterisco', () => {
    expect(por(start, 'Coach IA').valor).toBe('10 mensagens/dia')
    expect(por(pro, 'Coach IA').valor).toBe('40 mensagens/dia')
    expect(por(elite, 'Coach IA').valor).toBe('Ilimitado*')
    expect(por(elite, 'Workout Wizard').valor).toBe('Ilimitado*')
    expect(por(start, 'Workout Wizard').valor).toBe('1 por semana')
  })

  it('só o plano com "ilimitado" pede a nota de uso justo', () => {
    expect(start.usoJusto).toBe(false)
    expect(pro.usoJusto).toBe(false)
    expect(elite.usoJusto).toBe(true)
  })

  it('histórico: 60 dias no Start, ilimitado (null) nos outros', () => {
    expect(por(start, 'Histórico de treinos').valor).toBe('60 dias')
    expect(por(pro, 'Histórico de treinos').valor).toBe('Ilimitado')
    expect(por(elite, 'Histórico de treinos').valor).toBe('Ilimitado')
  })

  it('o que falta aparece como ausente, não some', () => {
    expect(por(start, 'Modo offline').incluido).toBe(false)
    expect(por(start, 'Macros completos').incluido).toBe(false)
    expect(por(start, 'Chef IA').incluido).toBe(false)
    expect(por(pro, 'Modo offline').incluido).toBe(true)
    expect(por(pro, 'Chef IA').incluido).toBe(false)
    expect(por(elite, 'Chef IA').incluido).toBe(true)
  })

  it('limites ausentes não viram "0 mensagens": a linha sai como não inclusa', () => {
    const vazio = linhasDoPlano(null)
    expect(vazio.linhas.find((l) => l.rotulo === 'Coach IA')).toMatchObject({ incluido: false, valor: '—' })
  })
})

describe('montarPlanos', () => {
  const r = montarPlanos(APP_PLANS, TEACHER_TIERS)!

  it('devolve start, pro e elite, nessa ordem, com o Pro em destaque', () => {
    expect(r.vip.map((p) => p.tier)).toEqual(['start', 'pro', 'elite'])
    expect(r.vip.filter((p) => p.destaque).map((p) => p.tier)).toEqual(['pro'])
  })

  it('preços mensais e anuais vêm da tabela', () => {
    expect(r.vip.map((p) => p.mensalCentavos)).toEqual([2990, 5990, 9990])
    expect(r.vip.map((p) => p.anualCentavos)).toEqual([29900, 59900, 99900])
  })

  it('linhas inativas NUNCA viram cartão nem trocam o preço', () => {
    const adulterado = APP_PLANS.map((p) => (p.id === 'vip_pro_month' ? { ...p, price_cents: 1 } : p))
    const out = montarPlanos(adulterado, TEACHER_TIERS)!
    expect(out.vip).toHaveLength(3)
    expect(out.vip[1].mensalCentavos).toBe(5990)
  })

  it('plano ativo marcado inativo some — e sem plano mensal o resultado é null (tudo ou nada)', () => {
    const semStart = APP_PLANS.map((p) => (p.id === 'vip_start' ? { ...p, status: 'inactive' } : p))
    expect(montarPlanos(semStart, TEACHER_TIERS)).toBeNull()
  })

  it('preço zero, negativo ou inválido num plano VIP derruba tudo em vez de mostrar errado', () => {
    for (const ruim of [0, -5, Number.NaN]) {
      const ruimes = APP_PLANS.map((p) => (p.id === 'vip_pro' ? { ...p, price_cents: ruim } : p))
      expect(montarPlanos(ruimes, TEACHER_TIERS)).toBeNull()
    }
  })

  it('sem o anual de UM plano, só aquele fica sem anual', () => {
    const semAnual = APP_PLANS.filter((p) => p.id !== 'vip_pro_annual')
    const out = montarPlanos(semAnual, TEACHER_TIERS)!
    expect(out.vip.map((p) => p.anualCentavos)).toEqual([29900, null, 99900])
  })

  it('professores saem ordenados por sort_order, e max_students 0 = ilimitado', () => {
    expect(r.professores.map((t) => t.chave)).toEqual(['free', 'starter', 'pro', 'elite', 'unlimited'])
    expect(r.professores.map((t) => t.maxAlunos)).toEqual([2, 15, 40, 100, null])
    expect(r.professores.map((t) => t.precoCentavos)).toEqual([0, 4900, 9700, 17900, 24900])
  })

  it('tier de professor inativo não aparece', () => {
    const out = montarPlanos(APP_PLANS, TEACHER_TIERS.map((t) => (t.tier_key === 'elite' ? { ...t, is_active: false } : t)))!
    expect(out.professores.map((t) => t.chave)).not.toContain('elite')
  })
})

describe('porAluno', () => {
  const t = montarPlanos(APP_PLANS, TEACHER_TIERS)!.professores
  const de = (chave: string) => t.find((x) => x.chave === chave)!

  it('divide o preço pelo teto de alunos', () => {
    expect(porAluno(de('starter'))).toBe(327) // 4900/15
    expect(porAluno(de('pro'))).toBe(243) // 9700/40
    expect(porAluno(de('elite'))).toBe(179) // 17900/100
  })

  it('não inventa número para o grátis nem para o ilimitado', () => {
    expect(porAluno(de('free'))).toBeNull()
    expect(porAluno(de('unlimited'))).toBeNull()
  })
})
