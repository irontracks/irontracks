/**
 * @module streak
 *
 * Sequência de dias treinados — fonte ÚNICA. O dia é sempre **BRT**.
 *
 * Por que existe (auditoria de 23/08/2026): duas rotas calculavam streak, cada
 * uma do seu jeito, e as duas bucketavam o dia com `toISOString().slice(0,10)`,
 * que é dia **UTC**. O servidor da Vercel roda em UTC, então um treino às 22h
 * no Brasil cai no dia seguinte.
 *
 * Não é teórico — medido em produção: **36 das 633 sessões (5,7%)** caem em dia
 * diferente entre BRT e UTC, e isso já colapsou dias reais de quatro usuários
 * (um perdeu 2 dias na contagem; outro GANHOU 1, porque um treino tarde da
 * noite virou um segundo dia). É o mesmo defeito que o heatmap de nutrição já
 * tinha e que `lib/nutrition/correlationDays.ts` corrigiu — a classe nunca foi
 * varrida, então sobreviveu aqui.
 *
 * A segunda divergência era de SEMÂNTICA: o `/social/profile` contava a partir
 * do dia mais recente do histórico, fosse ele de ontem ou de seis meses atrás —
 * quem parou de treinar em março continuava exibindo "streak de 12 dias". Um
 * streak é a sequência que chega até HOJE (ou ontem, para quem ainda vai
 * treinar); passou disso, acabou.
 */
import { brtDateKey } from '@/utils/cron/dateBrt'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Dias (BRT) em que houve treino, a partir de datas cruas.
 * Entradas ilegíveis são descartadas em silêncio — a origem é `completed_at`.
 */
export function buildStreakDays(dates: Iterable<unknown>): Set<string> {
  const out = new Set<string>()
  for (const raw of dates) {
    if (raw == null) continue
    const key = brtDateKey(raw as string | number | Date)
    if (key) out.add(key)
  }
  return out
}

/**
 * Sequência ATUAL de dias treinados.
 *
 * Começa em hoje; se hoje ainda não teve treino, tenta ontem — quem treina à
 * noite não pode ver o streak zerar durante o dia. Sem treino em nenhum dos
 * dois, a sequência acabou e a resposta é 0.
 *
 * `now` é injetável porque teste que depende de "hoje" precisa fixar o relógio
 * (e varrer a semana), regra do repo.
 */
export function calcStreak(days: Set<string>, now: Date = new Date()): number {
  if (!days.size) return 0

  const at = (offsetDays: number) => brtDateKey(new Date(now.getTime() - offsetDays * DAY_MS))

  let offset = 0
  if (!days.has(at(0))) {
    if (!days.has(at(1))) return 0
    offset = 1
  }

  let streak = 0
  while (days.has(at(offset))) {
    streak += 1
    offset += 1
  }
  return streak
}

/** Atalho: das datas cruas direto para a sequência. */
export function streakFromDates(dates: Iterable<unknown>, now: Date = new Date()): number {
  return calcStreak(buildStreakDays(dates), now)
}
