/**
 * @module flashSuppression
 *
 * O flash verde "BORA!" do fim do descanso ocupa a tela inteira
 * (`fixed inset-0`, `z-[2000]`). Os modais de método — Drop-Set, Cluster,
 * Rest-Pause e os outros 16 — são `z-[2350]` com backdrop `bg-black/80`.
 *
 * Quando o descanso acabava com um modal aberto, o verde ficava ATRÁS dele e
 * vazava pelo backdrop translúcido: 80% de preto sobre verde vira o verde
 * escuro que o dono fotografou em 22/08/2026 preenchendo as etapas de um Drop.
 * Nenhum z-index conserta — o flash não pode ir para cima (tomaria a tela de
 * quem está digitando) nem o backdrop pode ficar opaco (ele mostra o treino
 * atrás de propósito). Quem sobra é o flash: ele não deve nascer.
 *
 * Isso NÃO cala o fim do descanso. A barra inferior continua com o contador,
 * o "+X além do planejado" e o START — o sinal que importa está lá, e ela já
 * convive com os modais (ver `restBarInset.ts`).
 *
 * A detecção é por `aria-modal="true"`, não por uma lista de estados: são 19
 * modais em três arquivos, e uma lista seria guard de instância — o próximo
 * modal nasceria vazando de novo. É a mesma marca que o leitor de tela usa,
 * então quem esquecer dela já reprova no ratchet de a11y.
 */

/** Um diálogo modal está aberto na tela? */
export function hasOpenModalDialog(doc: Document | null | undefined): boolean {
  if (!doc || typeof doc.querySelector !== 'function') return false
  try {
    return doc.querySelector('[aria-modal="true"]') != null
  } catch {
    return false
  }
}

/**
 * O flash deve ser suprimido AGORA?
 *
 * Só faz sentido perguntar enquanto ele estaria visível: suprimir um flash que
 * já foi dispensado pelo toque re-grava o mesmo estado a cada mutação do DOM.
 */
export function shouldSuppressFinishedFlash(params: {
  isFinished: boolean
  alreadyDismissed: boolean
  doc: Document | null | undefined
}): boolean {
  const { isFinished, alreadyDismissed, doc } = params
  if (!isFinished || alreadyDismissed) return false
  return hasOpenModalDialog(doc)
}
