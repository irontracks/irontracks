/**
 * Narrador determinístico do chat de nutrição — puro, sem IA.
 *
 * Duas funções neste arquivo:
 *  1. É a resposta INTEIRA quando o atalho regex reconheceu a pergunta (caminho de
 *     custo zero).
 *  2. É a rede de segurança quando o Gemini escreve a prosa: renderizamos isto na
 *     hora e a prosa só substitui SE chegar. Card é a verdade, prosa é enfeite —
 *     a arquitetura tem que sobreviver ao modelo não responder.
 *
 * Não vive em chatPrompt.ts de propósito: isto é a NOSSA voz pro usuário, não
 * instrução pro modelo.
 */
import type { MealProjection } from './chatProjection'

export interface ReplyItem {
  label: string
  grams: number
}

const MACRO_LABEL = {
  protein: 'proteína',
  carbs: 'carboidrato',
  fat: 'gordura',
} as const

/** "5 ovos cozidos" → "5 ovos cozidos"; capitaliza a primeira letra pra abrir frase. */
function asSubject(foodText: string): string {
  const t = String(foodText ?? '').trim()
  if (!t) return 'Isso'
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/**
 * Narra a simulação com os números JÁ calculados em TypeScript.
 * Nenhum número aqui é inventado: todos vêm de `projectMeal`.
 */
/**
 * Peso total que o app ASSUMIU. Sempre dito, e por um motivo concreto: quando o
 * alimento não declara quanto pesa uma unidade, o parser cai num default de 50g
 * (parser.ts:219). Isso acerta em ovo (~50g) e erra feio em "uma pizza grande" —
 * que vira 50g e 133 kcal. Sem mostrar o peso, o app responderia "cabe!" com toda
 * a confiança e o usuário não teria como perceber. Com o peso à vista, ele lê
 * "(50g)", estranha e corrige ("800g de pizza"). Não conserta a estimativa —
 * torna o erro visível e corrigível, que é o que dá pra fazer sem mexer no parser.
 */
function weightNote(items: ReplyItem[] | undefined): string {
  const grams = (items ?? []).reduce((s, i) => s + (Number(i?.grams) || 0), 0)
  return grams > 0 ? ` (${Math.round(grams)}g)` : ''
}

export function buildTemplateReply(foodText: string, p: MealProjection, items?: ReplyItem[]): string {
  const kcal = p.calories
  const parts: string[] = []

  // 1. O que a comida é. Sem verbo de propósito: "5 ovos cozidos SOMAM" vs "200g de
  //    frango SOMA" — a concordância depende do alimento, e errar português na
  //    primeira linha da resposta é pior do que não ter verbo.
  parts.push(
    `${asSubject(foodText)}${weightNote(items)} — **${kcal.add} kcal** · P ${p.protein.add}g · C ${p.carbs.add}g · G ${p.fat.add}g.`,
  )

  // 2. Onde o dia fica.
  if (kcal.goal === null) {
    parts.push(`Seu dia vai pra **${kcal.projected} kcal**. (Você ainda não definiu uma meta.)`)
  } else if (kcal.over) {
    parts.push(
      `Seu dia vai pra **${kcal.projected}** de ${kcal.goal} kcal — ${Math.abs(kcal.remaining as number)} acima da meta.`,
    )
  } else {
    parts.push(
      `Seu dia vai pra **${kcal.projected}** de ${kcal.goal} kcal — sobram ${kcal.remaining}.`,
    )
  }

  // 3. Macros que estouram (só o que merece aviso).
  const over = (['protein', 'carbs', 'fat'] as const).filter((k) => p[k].over)
  if (over.length > 0) {
    const listed = over
      .map((k) => `${MACRO_LABEL[k]} ${p[k].projected}/${p[k].goal}g`)
      .join(' · ')
    parts.push(`Acima da meta: ${listed}.`)
  }

  // 4. Proteína é o macro que o usuário persegue — comenta quando ela ganha.
  if (!p.protein.over && p.protein.goal !== null && p.protein.add > 0) {
    parts.push(`Proteína fecha em ${p.protein.projected}/${p.protein.goal}g.`)
  }

  return parts.join(' ')
}
