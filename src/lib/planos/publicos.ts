/**
 * Planos e preços PÚBLICOS — a forma que a landing mostra.
 *
 * Módulo PURO (sem rede, sem server-only): recebe as linhas de `app_plans` e
 * `teacher_tiers` e devolve o que a tela desenha. A leitura mora em
 * `lerPublicos.ts`; o componente da landing importa só deste arquivo.
 *
 * Por que a landing NÃO digita preço: o valor cobrado vem destas duas tabelas
 * (Mercado Pago na web) e, no iPhone, de produtos da App Store de mesmo valor
 * (conferidos em 30/09/2026: R$ 29,90 · 59,90 · 99,90, só mensais). Um preço
 * escrito à mão na página diverge em silêncio no dia em que a tabela mudar — e
 * preço errado em página pública é promessa ao consumidor.
 *
 * As LINHAS de cada plano saem de `limits`, que é o que o app de fato aplica
 * (`getVipPlanLimits`), e não do texto solto em `features`: assim os três
 * cartões mostram as mesmas linhas, na mesma ordem, e o que falta num plano
 * aparece como ausente em vez de sumir. "Ilimitado" é um número alto no banco
 * (9999), por isso o corte em `LIMITE_ILIMITADO` e o asterisco de uso justo.
 */

export type TierVip = 'start' | 'pro' | 'elite'

export type LinhaDoPlano = {
  rotulo: string
  /** Texto à direita do rótulo ("40 mensagens/dia"). Vazio nas linhas de sim/não. */
  valor: string
  incluido: boolean
}

export type PlanoVip = {
  tier: TierVip
  nome: string
  mensalCentavos: number
  /** `null` quando o plano anual não está ativo — o seletor Anual esconde. */
  anualCentavos: number | null
  linhas: LinhaDoPlano[]
  /** Alguma linha usa "Ilimitado*" e precisa da nota de uso justo. */
  usoJusto: boolean
  destaque: boolean
}

export type TierProfessor = {
  chave: string
  nome: string
  descricao: string
  /** `null` = alunos ilimitados (`max_students = 0` no banco). */
  maxAlunos: number | null
  precoCentavos: number
}

export type PlanosPublicos = {
  vip: PlanoVip[]
  professores: TierProfessor[]
}

export type LinhaAppPlan = {
  id: string
  name: string
  interval: string
  price_cents: number
  currency?: string | null
  status?: string | null
  limits?: Record<string, unknown> | null
}

export type LinhaTeacherTier = {
  tier_key: string
  name: string
  description?: string | null
  max_students: number
  price_cents: number
  currency?: string | null
  sort_order?: number | null
  is_active?: boolean | null
}

/** No banco "ilimitado" é 9999 — acima disto a tela diz Ilimitado. */
export const LIMITE_ILIMITADO = 1000

const ORDEM_VIP: readonly TierVip[] = ['start', 'pro', 'elite']

const fmtCheio = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtInteiro = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

/** "R$ 29,90". Com `inteiroSemCentavos`, valor redondo vira "R$ 299". */
export function formatarBRL(centavos: number, inteiroSemCentavos = false): string {
  if (inteiroSemCentavos && centavos % 100 === 0) return fmtInteiro.format(centavos / 100)
  return fmtCheio.format(centavos / 100)
}

/** Meses de desconto do anual (2 quando o ano custa 10 meses). 0 se não há desconto real. */
export function mesesGratis(mensalCentavos: number, anualCentavos: number | null): number {
  if (anualCentavos == null || mensalCentavos <= 0) return 0
  const meses = Math.round(12 - anualCentavos / mensalCentavos)
  return meses >= 1 ? meses : 0
}

/** Quanto o ano sai por mês, arredondado ao centavo. */
export function anualPorMes(anualCentavos: number): number {
  return Math.round(anualCentavos / 12)
}

/** Custo por aluno com o plano cheio; `null` nos planos sem teto ou sem preço. */
export function porAluno(t: TierProfessor): number | null {
  if (t.maxAlunos == null || t.maxAlunos <= 0 || t.precoCentavos <= 0) return null
  return Math.round(t.precoCentavos / t.maxAlunos)
}

function numero(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** As seis linhas comparáveis, derivadas dos limites que o app aplica. */
export function linhasDoPlano(limits: Record<string, unknown> | null | undefined): {
  linhas: LinhaDoPlano[]
  usoJusto: boolean
} {
  const l = limits ?? {}
  let usoJusto = false

  const porDia = (n: number | null, unidade: string): string => {
    if (n == null) return '—'
    if (n >= LIMITE_ILIMITADO) {
      usoJusto = true
      return 'Ilimitado*'
    }
    return `${n} ${unidade}`
  }

  const chat = numero(l.chat_daily)
  const wizard = numero(l.wizard_weekly)
  // `history_days: null` é "sem limite de dias" (Pro e Elite); número é a janela.
  const historico = numero(l.history_days)

  const linhas: LinhaDoPlano[] = [
    { rotulo: 'Coach IA', valor: porDia(chat, 'mensagens/dia'), incluido: chat != null },
    { rotulo: 'Workout Wizard', valor: porDia(wizard, 'por semana'), incluido: wizard != null },
    {
      rotulo: 'Histórico de treinos',
      valor: historico == null ? 'Ilimitado' : `${historico} dias`,
      incluido: true,
    },
    { rotulo: 'Macros completos', valor: '', incluido: l.nutrition_macros === true },
    { rotulo: 'Modo offline', valor: '', incluido: l.offline === true },
    { rotulo: 'Chef IA', valor: '', incluido: l.chef_ai === true },
  ]
  return { linhas, usoJusto }
}

function ativa(r: { status?: string | null }): boolean {
  return r.status == null || r.status === 'active'
}

function precoValido(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0
}

/**
 * Monta o que a landing mostra, ou `null` se faltar QUALQUER plano VIP
 * mensal. Preferência por "tudo ou nada": uma tabela com Pro e Elite mas sem
 * Start seria um preço incompleto apresentado como completo.
 *
 * Linhas inativas são ignoradas mesmo que cheguem (a RLS anônima já as barra;
 * aqui é o segundo cinto) — o banco guarda `vip_pro_month` inativo com o mesmo
 * valor do `vip_pro` ativo, e misturar os dois duplicaria cartão.
 */
export function montarPlanos(
  appPlans: readonly LinhaAppPlan[],
  tiers: readonly LinhaTeacherTier[],
): PlanosPublicos | null {
  const vip: PlanoVip[] = []
  for (const tier of ORDEM_VIP) {
    const mensal = appPlans.find((p) => ativa(p) && p.id === `vip_${tier}` && p.interval === 'month')
    if (!mensal || !precoValido(mensal.price_cents)) return null
    const anual = appPlans.find((p) => ativa(p) && p.id === `vip_${tier}_annual` && p.interval === 'year')
    const { linhas, usoJusto } = linhasDoPlano(mensal.limits)
    vip.push({
      tier,
      nome: String(mensal.name || `VIP ${tier}`),
      mensalCentavos: mensal.price_cents,
      anualCentavos: anual && precoValido(anual.price_cents) ? anual.price_cents : null,
      linhas,
      usoJusto,
      destaque: tier === 'pro',
    })
  }

  return { vip, professores: montarTiersProfessor(tiers) }
}

/**
 * Níveis de professor, ordenados por `sort_order`. `max_students = 0` no banco
 * quer dizer "sem teto". Módulo à parte de `montarPlanos` porque a página do
 * professor lê SÓ esta tabela — a landing do VIP não pode derrubá-la, nem o
 * contrário.
 */
export function montarTiersProfessor(tiers: readonly LinhaTeacherTier[]): TierProfessor[] {
  return tiers
    .filter((t) => t.is_active !== false && typeof t.price_cents === 'number' && t.price_cents >= 0)
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((t) => ({
      chave: t.tier_key,
      nome: String(t.name || t.tier_key),
      descricao: String(t.description || ''),
      maxAlunos: t.max_students > 0 ? t.max_students : null,
      precoCentavos: t.price_cents,
    }))
}
