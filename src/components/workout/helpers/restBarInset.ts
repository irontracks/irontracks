/**
 * A faixa do rodapé que pertence à BARRA DO DESCANSO.
 *
 * `--it-rest-bar-h` é publicada pelo `RestTimerOverlay` (altura real, medida
 * por ResizeObserver) e removida quando o descanso acaba — sem descanso o
 * fallback é 0px e nada muda de lugar.
 *
 * Por que overlay de tela cheia precisa disso (relato do dono, 17/08/2026):
 * no modal do Rest-Pause o botão "15s" INICIA o descanso, e a barra nasce no
 * rodapé — atrás do modal, que é `fixed inset-0`. Resultado: o usuário toca em
 * 15s, o descanso começa, e ele não vê o cronômetro nem alcança o START.
 *
 * ⚠️ E NÃO se resolve com z-index, nem aqui nem no #833: se a barra subir
 * acima dos modais ela volta a cobrir o "Salvar" (que foi o bug de 14/08); se
 * ficar abaixo, o modal a esconde. Duas coisas fixas no mesmo pedaço de tela
 * só convivem GEOMETRICAMENTE — o modal devolve a faixa, e cada um fica com a
 * sua. Mesma solução do `WorkoutFooter`.
 */
export const REST_BAR_INSET = { bottom: 'var(--it-rest-bar-h, 0px)' } as const
