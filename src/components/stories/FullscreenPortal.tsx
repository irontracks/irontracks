'use client'

/**
 * Portal para `document.body` — o que faz um overlay em tela cheia funcionar
 * DE VERDADE em tela cheia.
 *
 * O bug que isto resolve (relato do dono, 19/08/2026: "sem botão para sair
 * dessa tela"): o editor de story de nutrição é `fixed inset-0 z-[2500]`, mas
 * ele nasce DENTRO do `NutritionOverlay`, que é
 * `fixed inset-x-0 bottom-0 z-[25]` com `top` abaixo do cabeçalho.
 *
 * `z-index` num elemento posicionado cria um **stacking context**: a partir
 * dali, o `2500` do filho só vale contra os irmãos DELE — contra o resto da
 * página, o editor inteiro continua valendo 25. Resultado no aparelho: o
 * cabeçalho do app fica por cima, o topo do editor (onde mora o botão Voltar)
 * é encoberto, e a pessoa fica presa numa tela sem saída visível.
 *
 * Aumentar o z-index não conserta — o número é local ao contexto. Só sair do
 * contexto conserta, e é isso que o portal faz.
 *
 * Vale para os TRÊS composers (nutrição, cardio, métricas): todos são montados
 * dentro de overlays/modais que criam contexto próprio, então o que salva um
 * hoje é o que salva os outros amanhã.
 */
import { useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Nada para assinar: o valor só difere entre servidor (false) e cliente (true). */
const semInscricao = () => () => {}

export function FullscreenPortal({ children }: { children: ReactNode }) {
  // `document` não existe no servidor. `useSyncExternalStore` dá o "estamos no
  // cliente" sem `setState` dentro de efeito (que o ESLint do repo proíbe, por
  // causar render em cascata) e sem mismatch de hidratação.
  const noCliente = useSyncExternalStore(semInscricao, () => true, () => false)

  if (!noCliente || typeof document === 'undefined') return null
  return createPortal(children, document.body)
}

export default FullscreenPortal
