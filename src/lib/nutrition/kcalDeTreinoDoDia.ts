import type { SupabaseClient } from '@supabase/supabase-js'
import { brtDayStartUtc } from '@/utils/cron/weekRangeBrt'
import { estimateSessionKcal } from '@/utils/calories/sessionKcal'
import { sessionKcalInputs, type KcalProfileLike } from '@/utils/calories/sessionKcalInputs'

/**
 * As calorias de treino do DIA — a mesma conta nas duas superfícies de nutrição.
 *
 * A página `/dashboard/nutrition` e o `NutritionOverlay` mostram o mesmo card
 * ("Treino hoje: ~X kcal", `NutritionMixer`) e chegavam nele por caminhos
 * diferentes. O overlay lia `workouts.notes` com o modelo MET; a página lia
 * **`workout_session_logs`**, que tem UMA linha em toda a produção — a última de
 * 02/04/2026 — e estimava `minutos × 7` quando achava algo.
 *
 * Ou seja, a página mostrava zero (a soma nunca passava de 0, e o card só
 * aparece com `> 0`), silenciosamente: a leitura vivia dentro de um `catch {}`
 * vazio. E se a tabela um dia fosse populada seria pior — o número divergiria
 * do relatório, que é exatamente a classe de bug que `sessionKcalInputs` existe
 * para fechar (foram 744 kcal no relatório contra 698 na nutrição, na mesma
 * sessão do dono).
 *
 * O curioso é que o próprio arquivo da página já sabia: 40 linhas abaixo, o
 * bloco do dia de descanso lê `workouts.notes` e traz o comentário
 * "workout_session_logs não é populada em produção". As duas metades
 * discordavam entre si.
 *
 * ⚠️ A QUERY também mora aqui, não só a soma. Unificar apenas a aritmética
 * deixaria as duas telas livres para filtrar sessões de forma diferente — que é
 * a metade do defeito que realmente causou a divergência.
 */

/** Uma linha de `workouts` com o JSON da sessão. */
export type LinhaDeSessao = { notes?: unknown }

/**
 * As sessões concluídas no dia-calendário de **Brasília**.
 *
 * ⚠️ A janela precisa ser convertida para UTC — e é aqui que a versão anterior
 * errava, herdada do overlay quando esta função nasceu. Ela mandava
 * `${dateKey}T00:00:00` sem offset, e `completed_at` é `timestamptz`: o
 * Postgrest resolve a string no fuso da SESSÃO, que é **UTC**. Na prática o
 * "hoje" ia de **21:00 do dia anterior** às **20:59 do dia**, deslocado 3 h.
 *
 * Medido em produção antes da correção: **37 de 658 sessões (5,6%), em 29 dias
 * distintos**, terminam depois das 21h BRT e eram contadas no dia SEGUINTE — a
 * última em 28/08/2026. É a mesma classe e quase a mesma proporção do bug do
 * streak (36 de 633), já corrigido.
 *
 * E não era só o card informativo: o `NutritionOverlay` decide `trainedToday`
 * pelo resultado desta query. Quem marcava "vou descansar" e treinava às 21h30
 * ficava com a **meta rebaixada** no dia em que treinou (~−442 kcal), e no dia
 * seguinte o app dizia que ele tinha treinado.
 *
 * O fim é EXCLUSIVO (`lt` do dia seguinte), não `lte ...T23:59:59`: aquele
 * teto perdia a sessão terminada em 23:59:59.5.
 *
 * Devolve o builder do Postgrest sem `await`, para o chamador poder colocá-lo
 * num `Promise.all` — o overlay depende disso para não somar round-trip.
 */
export function selecionarSessoesDoDia(
  supabase: SupabaseClient,
  userId: string,
  dateKey: string,
): PromiseLike<{ data: unknown }> {
  const inicio = brtDayStartUtc(dateKey)
  const fimExclusivo = new Date(inicio.getTime() + 24 * 60 * 60 * 1000)
  return supabase
    .from('workouts')
    .select('id, notes')
    .eq('user_id', userId)
    .eq('is_template', false)
    .gte('completed_at', inicio.toISOString())
    .lt('completed_at', fimExclusivo.toISOString())
}

/**
 * Soma as kcal das sessões pelo modelo MET, com os ingredientes resolvidos pelo
 * leitor único. Linha sem JSON válido é ignorada — nunca vira zero somado nem
 * derruba o total das outras.
 */
export function somarKcalDasSessoes(
  linhas: unknown,
  profile?: KcalProfileLike | null,
): number {
  if (!Array.isArray(linhas)) return 0
  let total = 0
  for (const linha of linhas) {
    const cru = (linha as LinhaDeSessao | null)?.notes
    let sessao: unknown = cru
    if (typeof cru === 'string') {
      try { sessao = JSON.parse(cru) } catch { continue }
    }
    if (!sessao || typeof sessao !== 'object') continue
    total += estimateSessionKcal(sessao, sessionKcalInputs(sessao, profile ?? null))
  }
  return total
}
