/**
 * O badge de solicitações pendentes precisa saber que ALGO mudou.
 *
 * A contagem vive no `AdminPanelBottomTabs`, e seu efeito dependia de
 * `currentTab`: só recontava ao NAVEGAR. Quem aprovava ou recusava uma
 * solicitação dentro da própria aba ficava olhando um número obsoleto — e o
 * caminho natural é justamente esse (abrir Solicitações, resolver várias,
 * continuar ali). O badge seguia dizendo "3" com a fila zerada até o admin sair
 * e voltar.
 *
 * Um badge que mente é pior que badge nenhum: ele é a única razão de o admin
 * abrir aquela aba.
 */

export const EVENTO_SOLICITACOES_MUDARAM = 'irontracks:solicitacoes-mudaram'

/** Avisa que a fila de solicitações mudou (aprovação, recusa, reenvio). */
export function avisarSolicitacoesMudaram(): void {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent(EVENTO_SOLICITACOES_MUDARAM))
}

/** Assina o aviso. Devolve a função de limpeza. */
export function ouvirSolicitacoesMudaram(aoMudar: () => void): () => void {
    if (typeof window === 'undefined') return () => {}
    window.addEventListener(EVENTO_SOLICITACOES_MUDARAM, aoMudar)
    return () => window.removeEventListener(EVENTO_SOLICITACOES_MUDARAM, aoMudar)
}
