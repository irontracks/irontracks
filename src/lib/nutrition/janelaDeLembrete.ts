/**
 * janelaDeLembrete — que horários do plano "venceram" desde a última passada do cron.
 *
 * O cron roda a cada 5 minutos, então ele não pergunta "que refeição é AGORA" e sim
 * "quais horários caíram na janela que acabou de passar". Sem isso, um horário
 * qualquer que não fosse múltiplo de 5 nunca dispararia.
 *
 * ⚠️ Tudo aqui é BRT (America/Sao_Paulo). A Vercel roda em UTC, e o app é
 * brasileiro: usar a hora do servidor jogaria o jantar das 21h no dia seguinte —
 * a mesma classe de defeito que já pegou o streak, o heatmap de nutrição e a cota
 * diária VIP neste repo.
 */

const BRT_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const MINUTOS_POR_DIA = 24 * 60

/** Largura da janela. 6 min para um cron de 5 — 1 min de sobreposição de propósito:
 *  execução atrasada não pode abrir buraco, e a repetição é barrada pelo dedupe. */
export const LARGURA_JANELA_MIN = 6

export type InstanteBrt = {
  /** YYYY-MM-DD no calendário de São Paulo. */
  dateKey: string
  /** 0 = domingo … 6 = sábado, em São Paulo. */
  weekday: number
  /** Minuto do dia, 0–1439. */
  minuto: number
}

/** Converte um YYYY-MM-DD em dia da semana. Meio-dia UTC evita a borda do fuso. */
function weekdayDaData(dateKey: string): number {
  const d = new Date(`${dateKey}T12:00:00Z`)
  return Number.isNaN(d.getTime()) ? 0 : d.getUTCDay()
}

/** Data (YYYY-MM-DD) de `dias` antes de `dateKey`. */
function dataMenosDias(dateKey: string, dias: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return dateKey
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}

/** O instante `d` observado em São Paulo: data, dia da semana e minuto do dia. */
export function instanteBrt(d: Date = new Date()): InstanteBrt {
  const partes = BRT_FMT.formatToParts(d)
  const get = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? ''
  const dateKey = `${get('year')}-${get('month')}-${get('day')}`
  // `hour12: false` devolve 24 para a meia-noite em alguns runtimes — 24:05 não
  // existe, e sem este `% 24` a janela da virada apontaria para o minuto 1445.
  const hora = Number(get('hour')) % 24
  const minuto = Number(get('minute'))
  return {
    dateKey,
    weekday: weekdayDaData(dateKey),
    minuto: (Number.isFinite(hora) ? hora : 0) * 60 + (Number.isFinite(minuto) ? minuto : 0),
  }
}

/**
 * Os instantes cobertos pela janela que termina AGORA (inclusive), do mais antigo
 * ao mais recente.
 *
 * ⚠️ A janela cruza a meia-noite: às 00:02, os minutos 1437–1439 pertencem a
 * ONTEM — outro dia da semana e outra chave de dedupe. Tratar tudo como "hoje"
 * faria a ceia das 23:58 de sábado ser cobrada do cardápio de domingo.
 */
export function janelaDeLembretes(
  agora: Date = new Date(),
  larguraMin: number = LARGURA_JANELA_MIN,
): InstanteBrt[] {
  const largura = Math.max(1, Math.min(MINUTOS_POR_DIA, Math.floor(larguraMin) || 1))
  const base = instanteBrt(agora)
  const out: InstanteBrt[] = []
  for (let atras = largura - 1; atras >= 0; atras--) {
    const bruto = base.minuto - atras
    if (bruto >= 0) {
      out.push({ dateKey: base.dateKey, weekday: base.weekday, minuto: bruto })
      continue
    }
    const dateKey = dataMenosDias(base.dateKey, 1)
    out.push({ dateKey, weekday: weekdayDaData(dateKey), minuto: bruto + MINUTOS_POR_DIA })
  }
  return out
}

/** Chave de busca de um horário do plano dentro da janela: dia da semana + minuto. */
export const chaveDoInstante = (weekday: number, minuto: number): string => `${weekday}:${minuto}`
