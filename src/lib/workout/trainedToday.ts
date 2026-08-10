/**
 * "O usuário já treinou HOJE?" — fonte única da resposta no cliente.
 *
 * A pergunta é feita por dois componentes do dashboard ao mesmo tempo: o
 * RestDayPromptCard (não perguntar "vai treinar hoje?" a quem já treinou) e o
 * QuickStartCard (o atalho "Treinar agora" some depois da sessão concluída).
 * Estava escrita inline num deles; duplicar significaria dois critérios de
 * "hoje" divergindo em silêncio no dia em que um mudar.
 *
 * Regras que valem para os dois:
 * - Sessões concluídas são linhas de `workouts` com `is_template = false` — a
 *   linha só nasce no POST /api/workouts/finish. Treino EM ANDAMENTO não conta.
 * - O dia é sempre o calendário de São Paulo (`brtDateKey`), nunca o UTC: às
 *   21h BRT o UTC já virou e a comparação crua erra o dia inteiro.
 * - NUNCA selecionar `workouts.notes` aqui — a sessão inteira mora nessa coluna
 *   e trazê-la para responder um booleano serviria centenas de KB à toa.
 */
import { createClient } from '@/utils/supabase/client'
import { brtDateKey } from '@/utils/cron/dateBrt'

/** Só o dia POSITIVO é memorizado: "treinou" não se desfaz, "não treinou" sim. */
const treinouNoDia = new Map<string, string>()
/** Chamadas em voo, para as duas montagens simultâneas virarem uma query só. */
const emVoo = new Map<string, Promise<boolean>>()

async function consultar(uid: string, hoje: string): Promise<boolean> {
  try {
    const supabase = createClient()
    const { data } = await supabase
      .from('workouts')
      .select('date')
      .eq('user_id', uid)
      .eq('is_template', false)
      .order('date', { ascending: false })
      .limit(5)
    const treinou = (Array.isArray(data) ? data : []).some(
      (w) => brtDateKey(String((w as { date?: string }).date ?? '')) === hoje,
    )
    if (treinou) treinouNoDia.set(uid, hoje)
    return treinou
  } catch {
    // Sem dados/rede: responde "não treinou" — esconder o atalho por falha de
    // leitura seria pior que mostrá-lo a quem já treinou.
    return false
  }
}

/** Houve sessão concluída hoje (BRT)? `false` também quando não dá para saber. */
export async function hasTrainedTodayBrt(userId: string): Promise<boolean> {
  const uid = String(userId || '').trim()
  if (!uid) return false
  const hoje = brtDateKey()
  if (treinouNoDia.get(uid) === hoje) return true
  const chave = `${uid}|${hoje}`
  const jaVoando = emVoo.get(chave)
  if (jaVoando) return jaVoando
  const p = consultar(uid, hoje).finally(() => { emVoo.delete(chave) })
  emVoo.set(chave, p)
  return p
}

/** Só para testes: zera a memória entre casos. */
export function __resetTrainedTodayCache() {
  treinouNoDia.clear()
  emVoo.clear()
}
