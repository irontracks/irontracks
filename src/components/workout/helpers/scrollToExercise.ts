/**
 * Rola até o card de um exercício do treino ativo.
 *
 * Extraído porque três caminhos precisam do MESMO gesto (o auto-alternar de
 * Bi-Set no ExerciseList, o "fazer depois" e o "retomar"), e cada cópia repetia
 * as duas decisões que não são óbvias:
 *
 *  • alvo preferido é a PRIMEIRA SÉRIE (`data-set-first`), não o topo do card:
 *    parar no cabeçalho deixa os campos de peso/reps fora da tela em celular;
 *  • `behavior: 'instant'`, não `'smooth'` — com `smooth` logo após um layout
 *    shift (o card acabou de expandir) o WKWebView do iOS dispara auto-zoom.
 *
 * O atraso existe porque o card pode estar RECOLHIDO no instante do toque: sem
 * esperar o React pintar a expansão, a âncora da primeira série ainda não está
 * no DOM e o scroll erra o alvo (cai no cabeçalho, ou não acontece).
 */
export const SCROLL_TO_EXERCISE_DELAY_MS = 250

export function scrollToExercise(exIdx: number, delayMs: number = SCROLL_TO_EXERCISE_DELAY_MS): () => void {
  if (typeof document === 'undefined') return () => { }
  const t = setTimeout(() => {
    try {
      const firstSet = document.querySelector<HTMLElement>(`[data-set-first="${exIdx}"]`)
      const card = document.querySelector<HTMLElement>(`[data-exercise-idx="${exIdx}"]`)
      const target = firstSet ?? card
      if (target) target.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'start' })
    } catch { /* silenced: rolar é conforto, nunca pode derrubar o treino */ }
  }, Math.max(0, delayMs))
  return () => clearTimeout(t)
}
