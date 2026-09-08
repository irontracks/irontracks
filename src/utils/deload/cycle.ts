/**
 * CICLO de descarga (deload) — a semana inteira, não a sessão solta.
 *
 * Por que existe
 * ─────────────
 * Até 08/09/2026 o deload era marcado por SÉRIE (`log.deload`) e derivado por
 * SESSÃO (`utils/report/sessionDeload`). Funciona para ler o passado, mas o app
 * não tinha como saber o presente: "estou no meio de uma descarga que vai até
 * sexta". O dono aplicou deload numa segunda dizendo que ia até sexta, e nem o
 * app nem o coach tinham onde ler isso — cada sessão era um evento isolado.
 *
 * Consequências de não ter ciclo:
 *  - o app não volta sozinho à carga cheia quando a descarga acaba;
 *  - não dá para avisar "sua descarga termina hoje";
 *  - um treino da mesma semana que não recebeu patch de deload é lido como
 *    sessão normal, e vira régua de comparação para os outros.
 *
 * Decisão de produto (dono, 08/09/2026): a DURAÇÃO é escolhida na ativação e o
 * escopo é a SEMANA TODA. Sem encerramento manual obrigatório e sem o app
 * adivinhando pela recuperação — o ciclo tem começo e fim declarados.
 *
 * Por que datas YYYY-MM-DD e não timestamps
 * ─────────────────────────────────────────
 * "Até sexta" é dia de calendário, não instante. Guardar timestamp obrigaria a
 * decidir que hora do dia a descarga acaba, e erraria a virada para quem treina
 * de noite — o mesmo problema que `utils/cron/dateBrt` documenta para os crons.
 * As chaves são o dia observado em São Paulo, e comparação lexicográfica de
 * YYYY-MM-DD já é ordem cronológica.
 */

import { brtDateKey } from '@/utils/cron/dateBrt'

export type DeloadCycle = {
  /** Primeiro dia da descarga, YYYY-MM-DD em São Paulo. */
  startDate: string
  /** Último dia da descarga, INCLUSIVO. YYYY-MM-DD em São Paulo. */
  endDate: string
  /** Dias que o usuário escolheu na ativação (1 = só hoje). */
  durationDays: number
  /** Instante da ativação, para auditoria. */
  startedAt: string
}

export type DeloadCycleStatus =
  /** Não há ciclo, ou o que existe já terminou. */
  | 'inactive'
  /** Em descarga, com pelo menos um dia depois de hoje. */
  | 'active'
  /** Em descarga e hoje é o último dia. */
  | 'ends_today'

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

const isRec = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/** Soma dias a uma chave YYYY-MM-DD sem passar por fuso. */
const addDays = (key: string, days: number): string => {
  const [y, m, d] = key.split('-').map(Number)
  // UTC de propósito: a chave já é o dia de São Paulo, e aritmética em UTC não
  // tem horário de verão para atrapalhar a contagem.
  const base = new Date(Date.UTC(y, m - 1, d))
  base.setUTCDate(base.getUTCDate() + days)
  return base.toISOString().slice(0, 10)
}

/**
 * Cria um ciclo começando HOJE (em São Paulo) e durando `durationDays` dias,
 * contando o próprio dia de hoje. Duração 1 = descarga de um dia só.
 */
export const createDeloadCycle = (durationDays: number, now: Date = new Date()): DeloadCycle | null => {
  const dias = Math.floor(Number(durationDays))
  if (!Number.isFinite(dias) || dias < 1) return null
  const startDate = brtDateKey(now)
  if (!DATE_KEY.test(startDate)) return null
  return {
    startDate,
    endDate: addDays(startDate, dias - 1),
    durationDays: dias,
    startedAt: now.toISOString(),
  }
}

/** Lê um ciclo vindo das settings (jsonb), devolvendo null se não for válido. */
export const parseDeloadCycle = (raw: unknown): DeloadCycle | null => {
  if (!isRec(raw)) return null
  const startDate = String(raw.startDate ?? '')
  const endDate = String(raw.endDate ?? '')
  if (!DATE_KEY.test(startDate) || !DATE_KEY.test(endDate)) return null
  if (endDate < startDate) return null
  const durationDays = Math.floor(Number(raw.durationDays))
  return {
    startDate,
    endDate,
    durationDays: Number.isFinite(durationDays) && durationDays >= 1 ? durationDays : 1,
    startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : '',
  }
}

export const getDeloadCycleStatus = (raw: unknown, now: Date = new Date()): DeloadCycleStatus => {
  const cycle = parseDeloadCycle(raw)
  if (!cycle) return 'inactive'
  const hoje = brtDateKey(now)
  if (hoje < cycle.startDate || hoje > cycle.endDate) return 'inactive'
  return hoje === cycle.endDate ? 'ends_today' : 'active'
}

/** Atalho: o usuário está em descarga agora? */
export const isDeloadCycleActive = (raw: unknown, now: Date = new Date()): boolean =>
  getDeloadCycleStatus(raw, now) !== 'inactive'

/**
 * Dias restantes CONTANDO hoje. 0 quando não há ciclo ativo, 1 no último dia.
 * É o número que a interface mostra ("descarga termina hoje" / "faltam 3 dias").
 */
export const getDeloadCycleDaysRemaining = (raw: unknown, now: Date = new Date()): number => {
  const cycle = parseDeloadCycle(raw)
  if (!cycle) return 0
  const hoje = brtDateKey(now)
  if (hoje < cycle.startDate || hoje > cycle.endDate) return 0
  let dias = 0
  for (let k = hoje; k <= cycle.endDate; k = addDays(k, 1)) {
    dias += 1
    // Guarda contra chave malformada que nunca alcançaria endDate.
    if (dias > 366) return 0
  }
  return dias
}

/**
 * O ciclo cobre o dia desta sessão? Usado ao LER o histórico: um treino feito
 * dentro da janela é de descarga mesmo que nenhuma série tenha recebido patch
 * (o usuário pode ter baixado a carga na mão).
 */
export const cycleCoversDate = (raw: unknown, date: Date | string | number): boolean => {
  const cycle = parseDeloadCycle(raw)
  if (!cycle) return false
  const key = brtDateKey(date)
  return DATE_KEY.test(key) && key >= cycle.startDate && key <= cycle.endDate
}
