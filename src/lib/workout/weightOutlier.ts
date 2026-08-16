/**
 * @module weightOutlier
 *
 * Detecta carga registrada MUITO fora do que o usuário costuma fazer naquele
 * exercício — o sintoma de um erro de digitação, não de progressão.
 *
 * Por que existe: a distância entre 12 kg e 120 kg é um toque. Foi exatamente a
 * classe do bug corrigido em 15/08/2026, em que tocar num campo com valor e
 * digitar INSERIA no cursor ("2" + tecla "1" = 12) em vez de substituir. Aquele
 * caminho foi fechado, mas o dedo errado continua existindo — e o app aceita
 * calado. O custo não para na tela: o histórico é a base que o motor de carga
 * automática lê depois, então um 120 fantasma vira sugestão de carga real na
 * sessão seguinte.
 *
 * O aviso é CONFERÊNCIA, nunca bloqueio: quem carrega 120 kg de verdade tem que
 * conseguir registrar 120 kg sem discutir com o app.
 */

/**
 * Quantas vezes o peso precisa destoar do histórico para virar suspeita.
 *
 * 4× é folgado de propósito. Progressão real anda em 2,5–10% por sessão e o
 * motor de autoload trava em +10%; nem uma virada de método chega perto de
 * quadruplicar. Já os erros de digitação típicos do teclado numérico —
 * dígito a mais (20 → 200), dígito a menos (120 → 12), inserção no cursor
 * (2 → 12) — produzem fator 5 a 10.
 *
 * Um limiar apertado (2×, digamos) transformaria o aviso em ruído, e aviso que
 * aparece à toa é aviso que o usuário aprende a ignorar — inclusive na vez em
 * que estiver certo.
 */
export const OUTLIER_FACTOR = 4

export type WeightOutlier = {
  /** Peso registrado agora, na sessão. */
  registrado: number
  /** Referência do histórico daquele exercício. */
  referencia: number
  direcao: 'acima' | 'abaixo'
}

/**
 * Compara o peso registrado com a referência do histórico.
 *
 * Devolve `null` — ou seja, NÃO avisa — quando não há com o que comparar.
 * Exercício novo, primeiro treino, peso corporal: sem histórico não existe
 * "fora do padrão", e chutar um padrão produziria alarme falso logo no
 * primeiro uso, que é o pior momento possível para o app parecer errado.
 */
export const detectWeightOutlier = (
  registrado: unknown,
  referencia: unknown,
): WeightOutlier | null => {
  const atual = Number(registrado)
  const ref = Number(referencia)
  if (!Number.isFinite(atual) || atual <= 0) return null
  if (!Number.isFinite(ref) || ref <= 0) return null

  if (atual >= ref * OUTLIER_FACTOR) return { registrado: atual, referencia: ref, direcao: 'acima' }
  if (atual * OUTLIER_FACTOR <= ref) return { registrado: atual, referencia: ref, direcao: 'abaixo' }
  return null
}

/** Frase curta para a linha do exercício no resumo de finalização. */
export const outlierLabel = (o: WeightOutlier): string => {
  const fmt = (n: number) => `${Number(n.toFixed(1)).toLocaleString('pt-BR')} kg`
  return `⚠️ conferir: ${fmt(o.registrado)} (costuma ser ${fmt(o.referencia)})`
}

/** Quantas sessões recentes entram na referência. */
const JANELA = 6

/** Mínimo de sessões com peso para haver referência. */
const MINIMO = 2

/**
 * Monta o peso de referência por exercício a partir do histórico de relatório.
 *
 * MEDIANA, não o último valor nem a média — e a escolha é o ponto do módulo.
 * O último valor pode ser justamente um erro de digitação já gravado, e aí a
 * referência sairia contaminada pelo problema que se quer detectar: um 120
 * fantasma na sessão passada faria o 120 de hoje parecer normal. A média sofre
 * do mesmo mal, só que diluído. A mediana ignora o ponto solto por construção.
 *
 * Menos de `MINIMO` sessões devolve nada para aquele exercício: com um único
 * registro não há padrão, e "fora do padrão" viraria opinião sobre um dado só.
 */
export const buildWeightReference = (
  reportHistory: unknown,
): Record<string, number> => {
  const out: Record<string, number> = {}
  const isRec = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
  if (!isRec(reportHistory)) return out
  const exercicios = isRec(reportHistory.exercises) ? reportHistory.exercises : null
  if (!exercicios) return out

  for (const [chave, valor] of Object.entries(exercicios)) {
    if (!isRec(valor)) continue
    const items = Array.isArray(valor.items) ? valor.items : []
    const pesos = items
      .slice(-JANELA)
      .map((it) => (isRec(it) ? Number(it.topWeight ?? it.avgWeight) : NaN))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b)
    if (pesos.length < MINIMO) continue
    const meio = Math.floor(pesos.length / 2)
    out[chave] = pesos.length % 2 === 1 ? pesos[meio] : (pesos[meio - 1] + pesos[meio]) / 2
  }
  return out
}
