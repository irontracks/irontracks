/**
 * funnelMetrics.ts — o cálculo do funil de conversão, puro e testável.
 *
 * Mora fora da rota de propósito: `payingActive` é o número que vai virar
 * manchete de um story, e número de manchete precisa de teste que possa
 * FALHAR. Dentro do handler HTTP ele só seria exercitável com mock de rede.
 *
 * Contexto (02/08/2026): o ciclo de conversão é cadastro → wizard → treino
 * criado → trial → paywall → assinante.
 */

export interface FunnelMetric {
  key: string
  label: string
  value: number
  /** Linha de apoio já formatada (ex.: taxa sobre a etapa anterior). */
  sub?: string
}

/**
 * Provedores que representam DINHEIRO entrando.
 *
 * `admin` e `manual` ficam de fora porque são cortesia concedida pelo painel —
 * contá-los como assinante infla a métrica com o que a própria casa deu.
 */
export const PAYING_PROVIDERS = ['apple', 'google', 'stripe', 'mercadopago', 'asaas'] as const

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

/** Pessoas distintas a partir de linhas `{ user_id }`. */
export const distinctUsers = (rows: unknown): number => {
  const set = new Set<string>()
  for (const r of Array.isArray(rows) ? rows : []) {
    const id = String(isRecord(r) ? r.user_id || '' : '').trim()
    if (id) set.add(id)
  }
  return set.size
}

/**
 * Assinantes que de fato PAGARAM e seguem vigentes.
 *
 * Três exclusões, todas por caso real do banco de produção:
 * - provedor de cortesia (`admin`/`manual`);
 * - `metadata.lifetime_grant` — a conta do Apple App Review tem entitlement
 *   vitalício concedido à mão para não travar a revisão;
 * - validade vencida. `valid_until` nulo é vitalício legítimo e conta.
 */
export const countPayingActive = (rows: unknown, nowMs: number = Date.now()): number =>
  (Array.isArray(rows) ? rows : []).filter((r) => {
    if (!isRecord(r)) return false
    if (String(r.status || 'active').toLowerCase() !== 'active') return false
    const provider = String(r.provider || '').toLowerCase()
    if (!(PAYING_PROVIDERS as readonly string[]).includes(provider)) return false
    const meta: Record<string, unknown> = isRecord(r.metadata) ? r.metadata : {}
    if (meta.lifetime_grant === true) return false
    if (r.valid_until == null) return true
    const until = Date.parse(String(r.valid_until))
    return Number.isFinite(until) && until > nowMs
  }).length

/** "60% de 5" — omitido quando não há base, para não imprimir "0% de 0". */
export const pctLabel = (part: number, whole: number): string | undefined =>
  whole > 0 ? `${Math.round((part / whole) * 100)}% de ${whole}` : undefined

export interface FunnelInput {
  /** Linhas `{ user_id, event_name }` de `user_activity_events` no período. */
  events: unknown
  /** Cadastros no período (count). */
  signups: number
  /** Linhas `{ user_id }` de sessões concluídas no período. */
  sessions: unknown
  /** Linhas `{ user_id }` de templates criados no período. */
  templates: unknown
  /** Linhas `{ user_id }` de entitlements com provider `trial` no período. */
  trials: unknown
  /** Linhas de `user_entitlements` ativos (todas, sem filtro de período). */
  entitlements: unknown
  nowMs?: number
}

/**
 * Monta a lista de métricas do funil.
 *
 * Toda métrica de PESSOA é distinct user_id, nunca contagem de evento: o
 * wizard reabre a cada visita de quem ainda não tem treino, então contar
 * evento transformaria 5 pessoas em 15 e a etapa seguinte pareceria ter
 * despencado.
 */
export const buildFunnelMetrics = (input: FunnelInput): FunnelMetric[] => {
  const events = (Array.isArray(input.events) ? input.events : []) as unknown[]
  const peopleWith = (names: string[]): number =>
    distinctUsers(events.filter((e) => isRecord(e) && names.includes(String(e.event_name || ''))))

  const activeUsers = distinctUsers(events)
  const wizardOpened = peopleWith(['wizard_open', 'wizard_auto_open'])
  const workoutsCreated = distinctUsers(input.templates)
  const paywallShown = peopleWith(['paywall_shown'])
  const paywallCta = peopleWith(['paywall_cta'])
  const sessionsLogged = (Array.isArray(input.sessions) ? input.sessions : []).length

  return [
    { key: 'activeUsers', label: 'USUÁRIOS ATIVOS', value: activeUsers },
    { key: 'signups', label: 'CADASTROS', value: Math.max(0, Number(input.signups) || 0) },
    { key: 'sessionsLogged', label: 'TREINOS REGISTRADOS', value: sessionsLogged },
    { key: 'wizardOpened', label: 'ABRIRAM O WIZARD', value: wizardOpened, sub: pctLabel(wizardOpened, activeUsers) },
    { key: 'workoutsCreated', label: 'CRIARAM TREINO', value: workoutsCreated, sub: pctLabel(workoutsCreated, wizardOpened) },
    { key: 'trialsGranted', label: 'TRIALS CONCEDIDOS', value: distinctUsers(input.trials) },
    { key: 'paywallShown', label: 'VIRAM O PAYWALL', value: paywallShown },
    { key: 'paywallCta', label: 'CLICARAM NA OFERTA', value: paywallCta, sub: pctLabel(paywallCta, paywallShown) },
    { key: 'payingActive', label: 'ASSINANTES ATIVOS', value: countPayingActive(input.entitlements, input.nowMs) },
  ]
}
