/**
 * Lançar refeição por VOZ — as duas decisões que não são óbvias.
 *
 * O ditado entrega texto; quem transforma texto em comida é o parser que já
 * existe (`lib/nutrition/parser.ts` → `resolveFood` → IA). Este módulo só
 * resolve como o texto ditado ENTRA no campo, e é puro para que a regra seja
 * exercitável sem microfone.
 */

import { isIosNative } from '@/utils/platform'

/**
 * Separador entre um ditado e o seguinte.
 *
 * ⚠️ **NÃO troque por `\n`.** O parser trata a primeira linha FÍSICA como NOME
 * da refeição quando ela não tem dígito e não bate exatamente com um alimento
 * conhecido (`isTitleLine`, em `parser.ts`). Ditar "peito de frango grelhado" e
 * depois "arroz" com quebra de linha faria o frango virar o nome da refeição e
 * **sumir da conta** — em silêncio, que é o pior jeito de errar aqui.
 *
 * O ` + ` é separador de ITEM no mesmo parser, e o que vem dele nunca é
 * confundido com título (a heurística exige que a linha seja a primeira linha
 * física inteira).
 */
export const SEPARADOR_DE_DITADO = ' + '

/** O texto já termina num separador que o parser entende? */
const terminaEmSeparador = (texto: string): boolean => /[+;,]\s*$/.test(texto)

/**
 * Junta o que já está no campo com o trecho recém-ditado.
 *
 * Acrescenta em vez de substituir porque ditar costuma ser em partes ("o arroz…
 * a carne… ah, e uma banana"), e porque o campo pode já ter texto digitado à
 * mão — apagar o que o usuário escreveu seria perda de trabalho dele.
 */
export function juntarDitado(atual: string, ditado: string): string {
    const novo = String(ditado ?? '').trim()
    if (!novo) return atual
    const base = String(atual ?? '').trimEnd()
    if (!base) return novo
    if (terminaEmSeparador(base)) return `${base} ${novo}`
    return `${base}${SEPARADOR_DE_DITADO}${novo}`
}

/**
 * O aparelho consegue ditar?
 *
 * No iOS nativo a resposta é sim mesmo sem `SpeechRecognition` no `window`: o
 * caminho de lá é o `SFSpeechRecognizer`, pela ponte do Capacitor. Perguntar só
 * pela API web esconderia o botão justamente onde a feature funciona melhor.
 *
 * Roda só no cliente — no servidor não há `window`, e a resposta seria um "não"
 * falso que apagaria o botão do HTML inicial.
 */
export function suportaDitado(): boolean {
    if (typeof window === 'undefined') return false
    if (isIosNative()) return true
    const w = window as unknown as Record<string, unknown>
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition)
}
