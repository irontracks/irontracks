/**
 * Seleciona o conteúdo de um campo numérico ao receber foco.
 *
 * Por que existe (achado do teste E2E de 15/08/2026): tocar num campo que já
 * tem número posiciona o cursor e a digitação INSERE — com "2" no campo,
 * digitar "1" produz "12". Na academia, com pressa, isso vira carga errada
 * gravada no histórico (e o histórico alimenta o motor de carga automática).
 * O comportamento esperado num campo curto de valor é substituir: toco, digito,
 * pronto.
 *
 * Detalhes que a implementação ingênua erra no iOS/WKWebView:
 *  - `select()` chamado DENTRO do onFocus frequentemente não pega, porque o
 *    WebKit ainda está posicionando o cursor pelo toque. Daí o
 *    `requestAnimationFrame`: a seleção acontece no frame seguinte, depois de o
 *    WebKit terminar.
 *  - `setSelectionRange` é mais confiável que `select()` em `type="text"` com
 *    `inputMode` numérico (que é como os campos do app são feitos — `type=number`
 *    rejeita vírgula no pt-BR, ver NumericInput).
 *  - Campo VAZIO não precisa de seleção; e um campo que perdeu o foco entre o
 *    toque e o frame seguinte não pode ter o texto selecionado à força (o
 *    usuário já foi para outro lugar).
 */
export function selectFieldContent(el: HTMLInputElement | null | undefined): void {
  if (!el) return
  const raf = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number
  raf(() => {
    try {
      // Saiu do campo antes do frame seguinte: não roubar a seleção de volta.
      if (typeof document !== 'undefined' && document.activeElement !== el) return
      const len = String(el.value ?? '').length
      if (len === 0) return
      el.setSelectionRange(0, len)
    } catch {
      // Alguns tipos de input não suportam setSelectionRange — select() cobre.
      try { el.select() } catch { /* campo não selecionável: segue sem seleção */ }
    }
  })
}

/** Handler pronto para `onFocus` de campo numérico. */
export function handleNumericFocusSelect(
  e: React.FocusEvent<HTMLInputElement>,
): void {
  selectFieldContent(e.currentTarget)
}

/**
 * Instala UM listener delegado que seleciona o conteúdo de qualquer campo
 * numérico ao focar. Devolve a função de limpeza.
 *
 * Por que delegação e não `onFocus` em cada campo: o app tem ~80 inputs
 * numéricos escritos à mão nos modais de método (Drop-set, Cluster, Rest-Pause,
 * FST-7, Sistema 21…) além dos que passam por `NumericInput`/`useInputField`.
 * Reescrever 80 JSX por regex é exatamente a operação que já colapsou arquivos
 * neste repo — e ainda deixaria o campo nº 81 nascer errado. Um listener no
 * documento cobre todos, inclusive os futuros, com um lugar só para manter.
 *
 * O alvo é reconhecido pelo `inputMode` (decimal/numeric), que é como TODO campo
 * de valor é escrito aqui (`type="number"` rejeita vírgula no pt-BR). Campo de
 * texto livre não tem inputMode numérico e fica de fora por construção.
 */
export function installNumericSelectOnFocus(doc: Document = document): () => void {
  const onFocusIn = (ev: Event) => {
    const el = ev.target
    if (!(el instanceof HTMLInputElement)) return
    const mode = (el.inputMode || el.getAttribute('inputmode') || '').toLowerCase()
    if (mode !== 'decimal' && mode !== 'numeric') return
    // `data-no-select-on-focus` deixa uma tela optar por sair da regra sem
    // precisar mexer aqui (nenhuma usa hoje; existe para não virar bloqueio).
    if (el.hasAttribute('data-no-select-on-focus')) return
    selectFieldContent(el)
  }
  doc.addEventListener('focusin', onFocusIn)
  return () => doc.removeEventListener('focusin', onFocusIn)
}
