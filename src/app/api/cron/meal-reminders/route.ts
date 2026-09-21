import { NextResponse } from 'next/server'
import { isCronAuthorizedAsync } from '@/utils/cron/auth'
import { createAdminClient } from '@/utils/supabase/admin'
import { insertNotifications } from '@/lib/social/notifyFollowers'
import { cacheSetNxStatus } from '@/utils/cache'
import { logError } from '@/lib/logger'
import { planDays, type PlanDay, type PlanMeal } from '@/lib/nutrition/dietPlanShape'
import { minutosDoDia, resumoDaRefeicao } from '@/lib/nutrition/mealTimes'
import { chaveDoInstante, janelaDeLembretes, type InstanteBrt } from '@/lib/nutrition/janelaDeLembrete'
import { construirSetDeLancadas, removerJaLancados } from '@/lib/nutrition/mealReminderAlreadyLogged'

export const dynamic = 'force-dynamic'

/**
 * Cron a cada 5 minutos — "está na hora do Almoço".
 *
 * ⚠️ Quem dispara é o **pg_cron do Supabase**, não o `vercel.json`: a conta
 * Vercel deste projeto é HOBBY, e o Hobby só aceita expressão DIÁRIA — uma
 * entrada de 5 em 5 minutos lá derruba o deploy antes de ele existir (o check
 * do PR fica vermelho sem log nenhum). O agendamento está em
 * `supabase/migrations/20260905075040_meal_reminders_pg_cron.sql`; quem procurar
 * este cron no `vercel.json` não vai achar, e é de propósito.
 *
 * A fonte é o PLANO do usuário (`student_diet_plans`, `meals[].time`), não uma
 * tabela de lembretes: o cardápio e a hora de comê-lo são o mesmo fato, e duas
 * tabelas divergiriam no dia em que alguém trocasse uma refeição.
 *
 * O disparo é por JANELA, não por igualdade de horário: com o cron de 5 em 5
 * minutos, um horário que não fosse múltiplo de 5 nunca casaria. A janela tem
 * 1 minuto de sobreposição, e quem impede a repetição é o dedupe.
 *
 * Tudo em BRT — ver `janelaDeLembrete.ts`.
 */

/** Teto de planos varridos por execução. Hoje a base tem 3 ativos; o limite existe
 *  para a rota não crescer sem ninguém perceber (orçamento de payload). */
const MAX_PLANOS = 2000

/** O dedupe dura o dia inteiro: o mesmo horário só é cobrado uma vez por dia. */
const TTL_DEDUPE_S = 26 * 60 * 60

type LinhaDePlano = { user_id?: string | null; meals?: unknown; days?: unknown }

/** O dia do plano que corresponde a este instante. Plano de um dia → o único. */
function diaDoPlano(days: PlanDay[], weekday: number): PlanDay | null {
  if (days.length <= 1) return days[0] ?? null
  return days.find((d) => d.weekday === weekday) ?? null
}

export async function GET(req: Request) {
  if (!await isCronAuthorizedAsync(req)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }
  try {
    const janela = janelaDeLembretes()
    const porInstante = new Map<string, InstanteBrt>()
    for (const inst of janela) porInstante.set(chaveDoInstante(inst.weekday, inst.minuto), inst)

    const admin = createAdminClient()
    // Sem `notes` e sem `plan_name`: esta rota roda 288×/dia e só precisa de quem,
    // o quê e quando.
    const { data, error } = await admin
      .from('student_diet_plans')
      .select('user_id, meals, days')
      .eq('status', 'active')
      .limit(MAX_PLANOS)
    if (error) throw new Error(error.message)

    const linhas = Array.isArray(data) ? (data as LinhaDePlano[]) : []
    const pendentes: Array<{ userId: string; meal: PlanMeal; instante: InstanteBrt }> = []

    for (const linha of linhas) {
      const userId = String(linha?.user_id || '').trim()
      if (!userId) continue
      const days = planDays(linha)
      if (!days.length) continue

      for (const inst of janela) {
        const dia = diaDoPlano(days, inst.weekday)
        if (!dia) continue
        for (const meal of dia.meals) {
          if (minutosDoDia(meal.time) !== inst.minuto) continue
          pendentes.push({ userId, meal, instante: inst })
        }
      }
    }

    if (!pendentes.length) return NextResponse.json({ ok: true, planos: linhas.length, enviados: 0 })

    // Quem já lançou a refeição no diário não precisa do lembrete — pedido do
    // dono (21/09/2026): "quando a refeição já foi lançada, não mandar a
    // notificação daquela refeição". Busca escopada aos (usuário, dia) desta
    // janela só, não a tabela inteira — a janela cobre no máximo 2 dias (a
    // virada de meia-noite) e um punhado de usuários por passada.
    const userIdsDaJanela = Array.from(new Set(pendentes.map((p) => p.userId)))
    const dateKeysDaJanela = Array.from(new Set(pendentes.map((p) => p.instante.dateKey)))
    const { data: entradasExistentes, error: erroEntradas } = await admin
      .from('nutrition_meal_entries')
      .select('user_id, date, food_name')
      .in('user_id', userIdsDaJanela)
      .in('date', dateKeysDaJanela)
    // Falha na leitura NÃO pode travar o cron nem, pior, silenciosamente
    // deixar de enviar lembrete nenhum: se não dá pra saber quem já lançou,
    // segue como antes desta regra (notifica cego) — perder o lembrete é
    // pior do que mandar um de quem já comeu.
    if (erroEntradas) logError('cron:meal-reminders:ja-lancadas', erroEntradas)
    const jaLancadas = construirSetDeLancadas(erroEntradas ? [] : (entradasExistentes ?? []))

    const pendentesNaoLancados = removerJaLancados(
      pendentes.map((p) => ({
        ...p,
        dateKey: p.instante.dateKey,
        nomeDaRefeicao: String(p.meal.name || 'Refeição').trim() || 'Refeição',
      })),
      jaLancadas,
    )
    const jaLancadasCount = pendentes.length - pendentesNaoLancados.length

    if (!pendentesNaoLancados.length) {
      return NextResponse.json({ ok: true, planos: linhas.length, enviados: 0, jaLancadas: jaLancadasCount })
    }

    const linhasDeNotificacao: Array<Record<string, unknown>> = []
    for (const { userId, meal, instante, nomeDaRefeicao } of pendentesNaoLancados) {
      const nome = nomeDaRefeicao
      const chave = `meal-reminder:${userId}:${instante.dateKey}:${meal.time}:${nome}`
      // 'unavailable' (Upstash fora) ENVIA: perder o lembrete é pior que repetir
      // — e o cron só cobre cada horário uma vez por janela.
      const status = await cacheSetNxStatus(chave, '1', TTL_DEDUPE_S).catch(
        (): 'unavailable' => 'unavailable',
      )
      if (status === 'exists') continue

      linhasDeNotificacao.push({
        user_id: userId,
        recipient_id: userId,
        sender_id: userId,
        type: 'meal_reminder',
        title: `🍽️ ${nome} · ${meal.time}`,
        message: resumoDaRefeicao(meal),
        is_read: false,
        metadata: { meal_name: nome, meal_time: meal.time, date: instante.dateKey },
      })
    }

    if (!linhasDeNotificacao.length) {
      return NextResponse.json({
        ok: true, planos: linhas.length, enviados: 0,
        deduplicados: pendentesNaoLancados.length, jaLancadas: jaLancadasCount,
      })
    }

    // O gate da preferência (`notifyMealReminders`) e o "não perturbar" já são
    // aplicados aqui dentro — é o mesmo caminho do cron de hidratação.
    await insertNotifications(linhasDeNotificacao)

    return NextResponse.json({
      ok: true, planos: linhas.length, enviados: linhasDeNotificacao.length, jaLancadas: jaLancadasCount,
    })
  } catch (e) {
    logError('cron:meal-reminders', e)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}
