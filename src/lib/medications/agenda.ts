/**
 * agenda — a conta de QUE doses valem, QUANDO vencem e quais já foram tomadas.
 *
 * Módulo puro: nenhum I/O, nenhum `Date.now()` escondido. O cron de lembretes, a
 * tela "Hoje" e a rota de "Tomei" decidem pelas MESMAS funções — se cada um
 * calculasse "esse remédio vale hoje?" por conta própria, a tela mostraria uma dose
 * que o push não avisou (ou o contrário), e ninguém saberia qual está certo.
 *
 * ⚠️ Tudo é BRT. Datas são `YYYY-MM-DD` comparadas como STRING — o formato é
 * ordenável lexicograficamente e escapa de `new Date()` + fuso local, que é a
 * classe de defeito que já pegou o streak, o heatmap de nutrição e a cota VIP.
 */
import { minutosDoDia, normalizarHorario } from '@/lib/nutrition/mealTimes'
import type { InstanteBrt } from '@/lib/nutrition/janelaDeLembrete'
import { brtDayStartUtc } from '@/utils/cron/weekRangeBrt'

/** O mínimo que a agenda precisa de um remédio — `Medication` serve, e o cron pode
 *  selecionar só estas colunas. */
export type MedicamentoAgendavel = {
  id: string
  user_id: string
  name: string
  dose: string | null
  times: string[]
  weekdays: number[]
  start_date: string
  end_date: string | null
  active: boolean
  created_at: string
}

/** Uma dose: um remédio, num dia, num horário. */
export type Dose = {
  userId: string
  medicationId: string
  nome: string
  dose: string | null
  /** `HH:MM` normalizado. */
  time: string
  /** Dia BRT da dose (`YYYY-MM-DD`) — o do INSTANTE, não o de quando o cron rodou. */
  dateKey: string
}

/** Uma tomada como vem do banco. */
export type TomadaCrua = {
  medication_id: string
  date: string
  scheduled_time: string
  taken_at?: string | null
}

export type DoseDoDia = Dose & {
  tomada: boolean
  /** ISO do momento em que foi marcada; null se ainda não foi tomada. */
  takenAt: string | null
}

export type GrupoDeLembrete = {
  userId: string
  dateKey: string
  time: string
  doses: Dose[]
}

/** Tamanho do corpo do push. Acima disso o iOS trunca por conta própria. */
const MAX_MENSAGEM = 140

/** Dia da semana (0 = domingo) de um `YYYY-MM-DD`. Meio-dia UTC foge da borda do fuso. */
export function weekdayDoDia(dateKey: string): number {
  const d = new Date(`${dateKey}T12:00:00Z`)
  return Number.isNaN(d.getTime()) ? 0 : d.getUTCDay()
}

/**
 * O remédio vale neste dia? Ativo, já começou, não acabou (`end_date` é INCLUSIVO —
 * quem termina o tratamento dia 10 ainda toma no dia 10) e o dia da semana está
 * na lista.
 */
export function medicamentoValeNoDia(
  med: Pick<MedicamentoAgendavel, 'active' | 'start_date' | 'end_date' | 'weekdays'>,
  dateKey: string,
  weekday: number = weekdayDoDia(dateKey),
): boolean {
  if (!med.active) return false
  if (med.start_date > dateKey) return false
  if (med.end_date && dateKey > med.end_date) return false
  return Array.isArray(med.weekdays) && med.weekdays.includes(weekday)
}

/** Identidade de uma dose — chave do dedupe do cron e do casamento com as tomadas. */
export const chaveDaDose = (medicationId: string, dateKey: string, time: string): string =>
  `${medicationId}:${dateKey}:${normalizarHorario(time) || time}`

/**
 * As doses cujo horário caiu dentro da janela do cron.
 *
 * ⚠️ Dia e dia da semana vêm do INSTANTE, não do "hoje" do cron. A janela cruza a
 * meia-noite: às 00:02 o minuto 23:58 é de ONTEM, e a validade (início, fim, dias da
 * semana) tem de ser avaliada para ontem. Quem usasse o dia de hoje avisaria uma
 * dose de domingo na madrugada de domingo — e deixaria de avisar a de sábado.
 *
 * ⚠️ Remédio criado DEPOIS do horário do dia não dispara hoje: cadastrar às 08:02 um
 * remédio das 08:00 não pode gerar "hora de tomar" para uma dose que já passou
 * antes de ele existir. A janela de 6 min sobrepõe a anterior de propósito, então
 * sem esta regra o cadastro logo após o horário notificaria na hora.
 */
export function dosesVencidasNaJanela(
  medicamentos: MedicamentoAgendavel[],
  janela: InstanteBrt[],
): Dose[] {
  const out: Dose[] = []
  const vistas = new Set<string>()

  for (const instante of janela) {
    for (const med of medicamentos) {
      if (!medicamentoValeNoDia(med, instante.dateKey, instante.weekday)) continue

      const criadoEm = Date.parse(med.created_at)
      for (const bruto of Array.isArray(med.times) ? med.times : []) {
        const time = normalizarHorario(bruto)
        if (!time || minutosDoDia(time) !== instante.minuto) continue

        // Dois instantes da janela podem casar a mesma dose (horário duplicado na
        // lista): uma dose, um push.
        const chave = chaveDaDose(med.id, instante.dateKey, time)
        if (vistas.has(chave)) continue

        if (Number.isFinite(criadoEm)) {
          const instanteDaDose = brtDayStartUtc(instante.dateKey).getTime() + instante.minuto * 60_000
          if (instanteDaDose < criadoEm) continue
        }

        vistas.add(chave)
        out.push({
          userId: med.user_id,
          medicationId: med.id,
          nome: med.name,
          dose: med.dose,
          time,
          dateKey: instante.dateKey,
        })
      }
    }
  }
  return out
}

/**
 * Tira as doses que o usuário já marcou como tomadas. O casamento é pela dose
 * (remédio + dia + horário), NÃO pelo horário sozinho: dois remédios no mesmo
 * horário são duas doses, e marcar um não pode silenciar o aviso do outro.
 */
export function removerDosesJaTomadas(doses: Dose[], tomadas: TomadaCrua[]): Dose[] {
  const tomadasPorChave = new Set(
    tomadas.map((t) => chaveDaDose(t.medication_id, t.date, t.scheduled_time)),
  )
  return doses.filter((d) => !tomadasPorChave.has(chaveDaDose(d.medicationId, d.dateKey, d.time)))
}

/**
 * Um lembrete por (usuário, dia, horário): quem toma três remédios às 08:00 recebe
 * UM push, não três. Preserva a ordem de aparição dos grupos; dentro do grupo, as
 * doses saem ordenadas pelo nome para o texto não depender da ordem do banco.
 */
export function agruparPorHorario(doses: Dose[]): GrupoDeLembrete[] {
  const grupos = new Map<string, GrupoDeLembrete>()
  for (const d of doses) {
    const k = `${d.userId}|${d.dateKey}|${d.time}`
    const g = grupos.get(k)
    if (g) g.doses.push(d)
    else grupos.set(k, { userId: d.userId, dateKey: d.dateKey, time: d.time, doses: [d] })
  }
  const lista = Array.from(grupos.values())
  for (const g of lista) g.doses.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  return lista
}

const rotuloDaDose = (d: Pick<Dose, 'nome' | 'dose'>): string =>
  d.dose ? `${d.nome} · ${d.dose}` : d.nome

/**
 * Título e corpo do push de um grupo (todas as doses no MESMO horário).
 *
 *   uma dose  → "💊 08:00 · Losartana · 50 mg"   /  "Hora de tomar."
 *   várias    → "💊 08:00 · 2 medicamentos"       /  "Losartana · 50 mg\nMetformina"
 *
 * Nome e dose aparecem no próprio push (decisão do dono): quem recebe no trabalho
 * decide sem abrir o app. O corte do corpo é por ITEM, nunca no meio de um nome.
 */
export function textoDoLembrete(doses: Dose[]): { titulo: string; mensagem: string } {
  const time = doses[0]?.time ?? ''
  if (doses.length === 0) return { titulo: `💊 ${time}`.trim(), mensagem: '' }

  if (doses.length === 1) {
    return {
      titulo: `💊 ${time} · ${rotuloDaDose(doses[0])}`,
      mensagem: 'Hora de tomar.',
    }
  }

  const itens = doses.map(rotuloDaDose)
  const cabem: string[] = []
  let usado = 0
  for (const item of itens) {
    const custo = (cabem.length ? 1 : 0) + item.length
    if (usado + custo > MAX_MENSAGEM) break
    cabem.push(item)
    usado += custo
  }
  const restantes = itens.length - cabem.length
  const corpo = cabem.join('\n')
  return {
    titulo: `💊 ${time} · ${doses.length} medicamentos`,
    mensagem: restantes > 0 ? `${corpo}\n+${restantes}` : corpo,
  }
}

/**
 * A lista "Hoje" da tela: toda dose que vale no dia, ordenada por horário e depois
 * por nome, já com o estado de tomada. A mesma regra de validade do cron, para a
 * tela e o push nunca discordarem sobre o que existe hoje.
 */
export function dosesDoDia(
  medicamentos: MedicamentoAgendavel[],
  tomadas: TomadaCrua[],
  dateKey: string,
): DoseDoDia[] {
  const weekday = weekdayDoDia(dateKey)
  const tomadaPorChave = new Map<string, TomadaCrua>()
  for (const t of tomadas) {
    tomadaPorChave.set(chaveDaDose(t.medication_id, t.date, t.scheduled_time), t)
  }

  const out: DoseDoDia[] = []
  for (const med of medicamentos) {
    if (!medicamentoValeNoDia(med, dateKey, weekday)) continue
    const vistos = new Set<string>()
    for (const bruto of Array.isArray(med.times) ? med.times : []) {
      const time = normalizarHorario(bruto)
      if (!time || vistos.has(time)) continue
      vistos.add(time)
      const tomada = tomadaPorChave.get(chaveDaDose(med.id, dateKey, time))
      out.push({
        userId: med.user_id,
        medicationId: med.id,
        nome: med.name,
        dose: med.dose,
        time,
        dateKey,
        tomada: Boolean(tomada),
        takenAt: tomada?.taken_at ?? null,
      })
    }
  }
  return out.sort(
    (a, b) =>
      a.time.localeCompare(b.time) ||
      a.nome.localeCompare(b.nome, 'pt-BR') ||
      a.medicationId.localeCompare(b.medicationId),
  )
}

/**
 * "Tomei" e "Desfazer" só valem para HOJE (dia BRT). Marcar dia passado reescreveria
 * a adesão que o professor lê; marcar dia futuro seria registrar o que não houve.
 */
export const podeRegistrarTomada = (dateKey: string, hojeKey: string): boolean =>
  Boolean(dateKey) && dateKey === hojeKey
