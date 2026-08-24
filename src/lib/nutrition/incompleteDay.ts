/**
 * Quais dias PARECEM registro incompleto — para o app sugerir, nunca decidir.
 *
 * ## O problema, medido
 *
 * A média do histórico divide pelos dias COM lançamento, o que já evita o pior
 * caso. Mas um dia em que a pessoa lançou só o café da manhã entra inteiro na
 * conta. Na base do dono em 24/08/2026 (68 dias): dias com 3+ refeições somam
 * **2.544 kcal** em média, os de 1 refeição, **970**. O app exibia **2.199**
 * contra 2.544 dos dias bem registrados — 345 kcal, ~14%, num número que vai
 * para o nutricionista.
 *
 * ## Por que SUGERIR e não excluir
 *
 * Em fase de CUT um dia de 1.200 kcal pode ser exatamente o plano. Excluí-lo
 * sozinho apagaria um dado verdadeiro e empurraria a média para CIMA — erro na
 * direção oposta, e invisível. A marca é sempre do usuário
 * (`nutrition_day_flags`); daqui sai só o candidato.
 *
 * ## As duas condições, e por que nenhuma serve sozinha
 *
 * Auditado contra os 68 dias reais antes de virar código:
 *
 *  - **"poucas refeições" sozinho erra:** 08/07 tem UMA refeição e
 *    **3.482 kcal** — 149% da mediana. Ele lançou o dia inteiro de uma vez.
 *    O critério por contagem excluiria o maior dia da série.
 *  - **"kcal baixa" sozinho erra:** 21/03 tem CINCO refeições e 1.026 kcal.
 *    Registrou tudo e comeu pouco; é dado verdadeiro.
 *
 * Só o cruzamento acerta. Com os limiares abaixo, os 68 dias produzem 11
 * candidatos, todos com 15–45% da mediana e no máximo 2 refeições — e nenhum
 * dos dois casos acima entra.
 *
 * ## Mediana, nunca média
 *
 * A referência é a MEDIANA do próprio usuário. Com a média, aquele dia de
 * 3.482 kcal levantaria a régua e mascararia os dias fracos ao redor — a mesma
 * razão pela qual `lib/workout/weightOutlier.ts` usa mediana: com o último
 * valor (ou com a média), um número extremo cega o detector logo depois de
 * aparecer.
 */
import type { NutritionHistoryDay } from './history'

/**
 * Abaixo disto a mediana é ruído, e o app fica calado.
 *
 * Sugerir a partir de 3 dias registrados é adivinhar o padrão de alguém que
 * ainda não tem padrão — e sugestão errada logo no começo ensina o usuário a
 * ignorar o aviso para sempre.
 */
export const MIN_DIAS_PARA_SUGERIR = 10

/** O dia precisa estar abaixo desta fração da mediana de kcal do usuário. */
export const FRACAO_KCAL = 0.5

/**
 * …e ter no máximo METADE da mediana de refeições.
 *
 * Fração, não número fixo: quem lança 5 refeições/dia e num dia lançou 2
 * esqueceu alguma; quem lança 2 por dia e lançou 2 está no padrão dele. Um
 * limiar fixo de "≤2 refeições" acusaria o segundo todo dia.
 */
export const FRACAO_REFEICOES = 0.5

export function mediana(valores: number[]): number {
  const l = valores.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (!l.length) return 0
  const meio = Math.floor(l.length / 2)
  return l.length % 2 ? l[meio] : (l[meio - 1] + l[meio]) / 2
}

export type PadraoDoUsuario = {
  /** `false` quando não há dias suficientes — nada é sugerido. */
  confiavel: boolean
  medianaKcal: number
  medianaRefeicoes: number
}

/** O padrão da própria pessoa, que serve de régua. */
export function padraoDoUsuario(dias: NutritionHistoryDay[] | null | undefined): PadraoDoUsuario {
  const lista = Array.isArray(dias) ? dias : []
  if (lista.length < MIN_DIAS_PARA_SUGERIR) {
    return { confiavel: false, medianaKcal: 0, medianaRefeicoes: 0 }
  }
  return {
    confiavel: true,
    medianaKcal: mediana(lista.map((d) => Number(d.calories) || 0)),
    medianaRefeicoes: mediana(lista.map((d) => Number(d.meals) || 0)),
  }
}

/**
 * Este dia parece incompleto, dado o padrão?
 *
 * Recebe o padrão pronto para a decisão não depender da janela que está na
 * tela: os mesmos 22/08 e 04/04 têm que ser sugeridos olhando 30 ou 90 dias.
 */
export function pareceIncompleto(dia: NutritionHistoryDay, padrao: PadraoDoUsuario): boolean {
  if (!padrao.confiavel) return false
  if (padrao.medianaKcal <= 0) return false
  const kcal = Number(dia?.calories) || 0
  const refeicoes = Number(dia?.meals) || 0
  const poucasRefeicoes = refeicoes <= padrao.medianaRefeicoes * FRACAO_REFEICOES
  const poucaComida = kcal < padrao.medianaKcal * FRACAO_KCAL
  return poucasRefeicoes && poucaComida
}

/**
 * Os dias a sugerir: parecem incompletos e ainda NÃO foram marcados.
 *
 * Quem já foi marcado sai da lista — insistir num dia que o usuário já
 * resolveu é o jeito mais rápido de o aviso virar papel de parede.
 */
export function diasSugeridos(
  dias: NutritionHistoryDay[] | null | undefined,
  jaMarcados: ReadonlySet<string>,
): string[] {
  const lista = Array.isArray(dias) ? dias : []
  const padrao = padraoDoUsuario(lista)
  if (!padrao.confiavel) return []
  return lista
    .filter((d) => !jaMarcados.has(d.date) && pareceIncompleto(d, padrao))
    .map((d) => d.date)
}
