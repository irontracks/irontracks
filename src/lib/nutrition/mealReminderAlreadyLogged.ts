/**
 * @module mealReminderAlreadyLogged
 *
 * Regra pedida pelo dono (21/09/2026): "quando a refeição já foi lançada, não
 * mandar a notificação daquela refeição". O cron `meal-reminders` disparava
 * cego pelo horário do plano — quem já tinha registrado o Almoço às 11h50
 * recebia o lembrete "🍽️ Almoço" às 12h do mesmo jeito.
 *
 * O casamento é por (usuário, dia BRT, NOME da refeição) contra
 * `nutrition_meal_entries.food_name` — que é o nome da refeição, não de um
 * alimento (`CLAUDE.md`: "food_name é o nome da REFEIÇÃO"). Medido em
 * produção: "Almoço"/"Jantar"/"Café da manhã" batem caractere a caractere com
 * `PlanMeal.name`, porque as duas telas de lançamento (My Diet Plan e o card
 * do overlay) gravam o próprio nome do card. `normalizeFoodKey` absorve o
 * resto (acento, caixa, pontuação) sem exigir que bata exato.
 *
 * ⚠️ Isto NÃO impede notificar de novo se a pessoa DESFIZER o lançamento —
 * não é o caso de hoje (a tela não tem "desfazer"), mas se ganhar, o dedupe
 * diário do cron (`cacheSetNxStatus`, TTL do dia) continuaria barrando um
 * segundo envio no mesmo dia de qualquer forma. Esta checagem só evita o
 * lembrete de quem JÁ comeu; não é o mecanismo de "só uma vez por dia".
 */
import { normalizeFoodKey } from './learned-foods'

/** Chave de casamento: usuário + dia + refeição, tudo normalizado. */
export function chaveDaRefeicaoLancada(userId: string, dateKey: string, nomeDaRefeicao: string): string {
  return `${userId}:${dateKey}:${normalizeFoodKey(nomeDaRefeicao)}`
}

export interface EntradaDeRefeicao {
  user_id?: unknown
  date?: unknown
  food_name?: unknown
}

/** O Set de chaves de refeições já lançadas, a partir de linhas cruas do banco. */
export function construirSetDeLancadas(entradas: EntradaDeRefeicao[]): Set<string> {
  const set = new Set<string>()
  for (const e of entradas) {
    const userId = String(e?.user_id ?? '').trim()
    const dateKey = String(e?.date ?? '').trim()
    const nome = String(e?.food_name ?? '').trim()
    if (!userId || !dateKey || !nome) continue
    set.add(chaveDaRefeicaoLancada(userId, dateKey, nome))
  }
  return set
}

/**
 * Filtra os pendentes, removendo quem já tem a refeição lançada naquele dia.
 * Puro — recebe o Set já montado, não vai ao banco.
 */
export function removerJaLancados<T extends { userId: string; dateKey: string; nomeDaRefeicao: string }>(
  pendentes: T[],
  lancadas: Set<string>,
): T[] {
  return pendentes.filter((p) => !lancadas.has(chaveDaRefeicaoLancada(p.userId, p.dateKey, p.nomeDaRefeicao)))
}
