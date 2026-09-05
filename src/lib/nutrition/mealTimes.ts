/**
 * mealTimes — o HORÁRIO das refeições do plano alimentar.
 *
 * O horário mora no próprio plano (`PlanMeal.time`, que o shape já declarava e as
 * telas já desenhavam), e não numa tabela de lembretes à parte: o cardápio e a hora
 * de comê-lo são o mesmo fato, e separá-los criaria duas verdades para sincronizar.
 *
 * A unidade de edição é o NOME da refeição, não a refeição de um dia: um plano de
 * semana tem 7 × ~6 = 42 refeições, e ninguém preenche 42 campos. Quem define
 * "Café da manhã 07:00" define para os sete dias — é assim que a rotina de quem
 * segue dieta realmente funciona.
 */
import type { PlanDay, PlanMeal } from './dietPlanShape'

/** Teto de refeições distintas que o editor aceita (o plano já limita a 10/dia). */
export const MAX_REFEICOES_COM_HORARIO = 20

/** Tamanho do corpo do push. Acima disso o iOS trunca por conta própria. */
const MAX_RESUMO = 140

/**
 * `HH:MM` em 24 h, ou `''` para "sem horário". Qualquer outra coisa vira `''` —
 * horário inválido gravado no plano viraria lembrete que nunca dispara (ou pior,
 * dispara na hora errada), e isso é silencioso.
 */
export function normalizarHorario(v: unknown): string {
  const s = String(v ?? '').trim()
  const m = /^(\d{1,2}):(\d{2})$/.exec(s)
  if (!m) return ''
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isInteger(h) || !Number.isInteger(min)) return ''
  if (h < 0 || h > 23 || min < 0 || min > 59) return ''
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/** Minuto do dia (0–1439) de um `HH:MM`, ou `null` se o horário não for válido. */
export function minutosDoDia(hhmm: unknown): number | null {
  const t = normalizarHorario(hhmm)
  if (!t) return null
  const [h, m] = t.split(':')
  return Number(h) * 60 + Number(m)
}

const nomeDaRefeicao = (m: PlanMeal): string => String(m?.name ?? '').trim()

export type RefeicaoComHorario = {
  nome: string
  time: string
  /** Em quantos DIAS do plano esta refeição aparece. */
  dias: number
}

/**
 * Os nomes distintos de refeição do plano, na ordem em que aparecem, com o horário
 * que cada um já tem e em quantos dias ele vale. Alimenta o editor.
 *
 * ⚠️ A contagem de dias não é enfeite. Um plano de semana REAL não repete as
 * mesmas refeições nos sete dias: no plano da conta de teste, "Café da manhã"
 * existe só no sábado e no domingo — nos dias de treino ela se chama
 * "Pré-treino". Sem dizer isso, o editor promete "vale para todos os dias" e
 * entrega dois, e quem confiou fica sem lembrete na segunda.
 *
 * Quando o mesmo nome aparece com horários diferentes em dias diferentes (plano
 * vindo da IA, ou editado antes desta tela existir), vence o PRIMEIRO encontrado:
 * o editor mostra um valor só por nome, e inventar um "vários" aqui só empurraria
 * a ambiguidade para a tela.
 */
export function horariosDoPlano(days: PlanDay[] | null | undefined): RefeicaoComHorario[] {
  const out: RefeicaoComHorario[] = []
  const vistos = new Map<string, number>()
  for (const dia of Array.isArray(days) ? days : []) {
    // Um nome repetido DENTRO do mesmo dia continua sendo um dia só.
    const contadosNesteDia = new Set<string>()
    for (const meal of Array.isArray(dia?.meals) ? dia.meals : []) {
      const nome = nomeDaRefeicao(meal)
      if (!nome) continue
      const idx = vistos.get(nome)
      const time = normalizarHorario(meal?.time)
      if (idx === undefined) {
        if (out.length >= MAX_REFEICOES_COM_HORARIO) continue
        vistos.set(nome, out.length)
        out.push({ nome, time, dias: 1 })
        contadosNesteDia.add(nome)
        continue
      }
      const atual = out[idx]
      if (!atual) continue
      if (!contadosNesteDia.has(nome)) {
        atual.dias += 1
        contadosNesteDia.add(nome)
      }
      // O primeiro horário encontrado vence, mas um nome que só aparece com
      // horário no 3º dia não pode ficar vazio no editor.
      if (!atual.time && time) atual.time = time
    }
  }
  return out
}

/**
 * Aplica o mapa `nome → horário` em TODAS as refeições de mesmo nome, em todos os
 * dias. Horário vazio APAGA a chave — é como o usuário desfaz, e é a mesma regra da
 * observação da refeição (chave vazia só engordaria o JSON de 42 refeições).
 *
 * Nome ausente do mapa fica INTOCADO: o editor manda o que ele mostrou, e uma
 * refeição que ele não conhece (plano alterado noutra aba) não pode perder o
 * horário por omissão.
 */
export function aplicarHorarios(
  days: PlanDay[] | null | undefined,
  mapa: Record<string, string> | null | undefined,
): PlanDay[] {
  const entradas = new Map<string, string>()
  for (const [nome, valor] of Object.entries(mapa ?? {})) {
    const chave = String(nome ?? '').trim()
    if (chave) entradas.set(chave, normalizarHorario(valor))
  }
  if (!entradas.size) return Array.isArray(days) ? days : []

  return (Array.isArray(days) ? days : []).map((dia) => ({
    ...dia,
    meals: (Array.isArray(dia?.meals) ? dia.meals : []).map((meal) => {
      const nome = nomeDaRefeicao(meal)
      if (!entradas.has(nome)) return meal
      const time = entradas.get(nome) ?? ''
      const { time: _antigo, ...semHorario } = meal
      return time ? { ...semHorario, time } : semHorario
    }),
  }))
}

/**
 * Corpo do push: o que comer, não só "está na hora". Quem recebe na academia ou no
 * trabalho decide sem abrir o app — que é o ponto de mandar a notificação.
 */
export function resumoDaRefeicao(meal: PlanMeal | null | undefined): string {
  const itens = (Array.isArray(meal?.items) ? meal.items : [])
    .map((it) => {
      const food = String(it?.food ?? '').trim()
      if (!food) return ''
      const g = Math.round(Number(it?.grams) || 0)
      return g > 0 ? `${g}g ${food}` : food
    })
    .filter(Boolean)

  const kcal = Math.round(Number(meal?.totals?.calories) || 0)
  const sufixo = kcal > 0 ? ` · ${kcal} kcal` : ''
  if (!itens.length) return sufixo ? sufixo.replace(' · ', '') : 'Hora de registrar no diário.'

  // Corta por ITEM, nunca no meio de um alimento: "200g pati…" é pior que dizer
  // quantos ficaram de fora.
  const teto = MAX_RESUMO - sufixo.length
  const cabem: string[] = []
  let usado = 0
  for (const item of itens) {
    const custo = (cabem.length ? 2 : 0) + item.length
    if (usado + custo > teto) break
    cabem.push(item)
    usado += custo
  }
  if (!cabem.length) return `${itens.length} alimentos${sufixo}`
  const restantes = itens.length - cabem.length
  const lista = restantes > 0 ? `${cabem.join(', ')} +${restantes}` : cabem.join(', ')
  return `${lista}${sufixo}`
}
