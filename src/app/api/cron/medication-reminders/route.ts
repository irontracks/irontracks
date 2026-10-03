import { NextResponse } from 'next/server'
import { isCronAuthorizedAsync } from '@/utils/cron/auth'
import { createAdminClient } from '@/utils/supabase/admin'
import { insertNotifications } from '@/lib/social/notifyFollowers'
import { cacheSetNxStatus } from '@/utils/cache'
import { logError } from '@/lib/logger'
import { janelaDeLembretes } from '@/lib/nutrition/janelaDeLembrete'
import {
  agruparPorHorario,
  chaveDaDose,
  dosesVencidasNaJanela,
  removerDosesJaTomadas,
  textoDoLembrete,
  type Dose,
  type MedicamentoAgendavel,
  type TomadaCrua,
} from '@/lib/medications/agenda'

export const dynamic = 'force-dynamic'

/**
 * Cron a cada 5 minutos — "hora de tomar o remédio".
 *
 * ⚠️ Quem dispara é o **pg_cron do Supabase**, não o `vercel.json` (conta Hobby só
 * aceita cron diário) — o agendamento está em
 * `supabase/migrations/20261003120100_medication_reminders_pg_cron.sql`. Mesmo
 * desenho do `meal-reminders`; ver o comentário de lá.
 *
 * A fonte é a tabela `medications` (horários fixos em BRT, dias da semana,
 * início/fim). A conta de "que dose vence nesta janela" mora em
 * `lib/medications/agenda.ts` — a MESMA que a tela "Hoje" usa, para o push e a
 * lista nunca discordarem sobre o que existe hoje.
 *
 * Um push por (usuário, dia, horário): três remédios às 08:00 são UM aviso.
 * Dose já marcada como tomada não avisa. O "não perturbar" e o toggle
 * `notifyMedications` são aplicados dentro de `insertNotifications`/sender.
 */

/** Teto de remédios varridos por execução (30 por usuário no máximo). Existe para a
 *  rota não crescer sem ninguém perceber. */
const MAX_MEDICAMENTOS = 5000

/** O dedupe dura o dia inteiro: a mesma dose só é cobrada uma vez por dia. */
const TTL_DEDUPE_S = 26 * 60 * 60

const COLUNAS = 'id, user_id, name, dose, times, weekdays, start_date, end_date, active, created_at'

export async function GET(req: Request) {
  if (!(await isCronAuthorizedAsync(req))) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }
  try {
    const janela = janelaDeLembretes()
    // A janela cruza a meia-noite: os dois dias entram na consulta. Ordenar como
    // string é seguro (YYYY-MM-DD).
    const dateKeys = Array.from(new Set(janela.map((i) => i.dateKey))).sort()
    const minKey = dateKeys[0]
    const maxKey = dateKeys[dateKeys.length - 1]

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('medications')
      .select(COLUNAS)
      .eq('active', true)
      .lte('start_date', maxKey)
      .or(`end_date.is.null,end_date.gte.${minKey}`)
      .limit(MAX_MEDICAMENTOS)
    // supabase-js não lança: sem olhar `error`, falha de leitura viraria "nenhum
    // remédio hoje" e o cron ficaria verde e mudo.
    if (error) throw new Error(error.message)

    const medicamentos = Array.isArray(data) ? (data as unknown as MedicamentoAgendavel[]) : []
    const vencidas = dosesVencidasNaJanela(medicamentos, janela)

    if (!vencidas.length) {
      return NextResponse.json({ ok: true, medicamentos: medicamentos.length, doses: 0, enviados: 0 })
    }

    // Quem já marcou "Tomei" não precisa do aviso. A busca é escopada aos remédios e
    // dias desta janela, não à tabela inteira.
    const idsDaJanela = Array.from(new Set(vencidas.map((d) => d.medicationId)))
    const diasDaJanela = Array.from(new Set(vencidas.map((d) => d.dateKey)))
    const { data: tomadasData, error: erroTomadas } = await admin
      .from('medication_intakes')
      .select('medication_id, date, scheduled_time')
      .in('medication_id', idsDaJanela)
      .in('date', diasDaJanela)
    // Falha na leitura NÃO trava o cron: se não dá para saber o que já foi tomado,
    // avisa como antes desta regra — perder o lembrete é pior que mandar um de quem
    // já tomou (mesmo critério do lembrete de refeição).
    if (erroTomadas) logError('cron:medication-reminders:tomadas', erroTomadas)
    const tomadas: TomadaCrua[] = erroTomadas || !Array.isArray(tomadasData) ? [] : (tomadasData as TomadaCrua[])

    const pendentes = removerDosesJaTomadas(vencidas, tomadas)
    const jaTomadas = vencidas.length - pendentes.length

    if (!pendentes.length) {
      return NextResponse.json({
        ok: true, medicamentos: medicamentos.length, doses: vencidas.length, enviados: 0, jaTomadas,
      })
    }

    // Dedupe POR DOSE (não por grupo): a janela de 6 min sobrepõe a anterior, e uma
    // dose cadastrada entre duas passadas pode entrar num grupo já avisado. Doses
    // novas do mesmo horário ainda saem; as já avisadas não repetem.
    const aEnviar: Dose[] = []
    for (const dose of pendentes) {
      const chave = `med-reminder:${chaveDaDose(dose.medicationId, dose.dateKey, dose.time)}`
      // 'unavailable' (Upstash fora) ENVIA: perder o lembrete é pior que repetir.
      const status = await cacheSetNxStatus(chave, '1', TTL_DEDUPE_S).catch(
        (): 'unavailable' => 'unavailable',
      )
      if (status === 'exists') continue
      aEnviar.push(dose)
    }

    if (!aEnviar.length) {
      return NextResponse.json({
        ok: true, medicamentos: medicamentos.length, doses: vencidas.length, enviados: 0,
        deduplicadas: pendentes.length, jaTomadas,
      })
    }

    const linhas: Array<Record<string, unknown>> = []
    for (const grupo of agruparPorHorario(aEnviar)) {
      const { titulo, mensagem } = textoDoLembrete(grupo.doses)
      linhas.push({
        user_id: grupo.userId,
        recipient_id: grupo.userId,
        sender_id: grupo.userId,
        type: 'medication_reminder',
        title: titulo,
        message: mensagem,
        is_read: false,
        // Sem `link`: a tela de medicamentos é um modal aberto pelo shell a partir
        // do TIPO, não uma URL.
        metadata: {
          medication_ids: grupo.doses.map((d) => d.medicationId),
          time: grupo.time,
          date: grupo.dateKey,
        },
      })
    }

    const resultado = await insertNotifications(linhas)
    if (resultado && resultado.ok === false) {
      throw new Error(resultado.error || 'insertNotifications falhou')
    }

    return NextResponse.json({
      ok: true,
      medicamentos: medicamentos.length,
      doses: vencidas.length,
      enviados: linhas.length,
      jaTomadas,
    })
  } catch (e) {
    logError('cron:medication-reminders', e)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}
