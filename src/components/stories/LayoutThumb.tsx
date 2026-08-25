'use client'

/**
 * Miniatura de um layout de story.
 *
 * Antes, escolher layout era ler sete palavras — "Normal", "Direita",
 * "Esquerda", "Topo" — e adivinhar o que cada uma faz com o conteúdo. Palavra
 * que descreve posição obriga o usuário a imaginar o resultado e testar até
 * acertar; é formulário, não editor. A miniatura entrega em 200ms o que o texto
 * não entrega em três toques.
 *
 * ⚠️ Cada desenho corresponde ao que `renderStoryFrame` de fato faz
 * (`storyComposerUtils.ts`) — miniatura que mente é pior que texto honesto:
 *
 *  - `bottom-row` → três cards em LINHA, ancorados embaixo
 *  - `top-row`    → marca, título e cards todos alinhados ao TOPO
 *  - `left/right-stack` → três cards EMPILHADOS ocupando ~52% da largura
 *  - `workout`    → tabela de exercícios (uma linha por exercício)
 *  - `live`/`group` → posições livres, arrastadas pelo usuário
 *
 * Tudo em `currentColor`: a miniatura acende junto com o estado do botão, sem
 * o componente precisar saber se está selecionado.
 */

type Props = { id: string; className?: string }

/** 9:16 — a proporção real do story, para a miniatura não mentir na forma. */
const VB = { w: 36, h: 64 }

/** Cheio = conteúdo principal (cards); esmaecido = texto de apoio. */
const FORTE = 0.9
const FRACO = 0.35

/**
 * As pilhas de `left-stack` e `right-stack` encostam na BORDA de propósito.
 * Com a miniatura renderizada a ~25px de largura, um deslocamento tímido some:
 * medido na primeira versão, "Direita" e "Esquerda" ficaram indistinguíveis a
 * olho nu — e miniatura que exige zoom não serve para nada.
 */

function Blocos({ id }: { id: string }) {
  switch (id) {
    case 'top-row':
      return (
        <>
          <rect x="5" y="7" width="12" height="2.5" rx="1.25" opacity={FRACO} />
          <rect x="5" y="12" width="20" height="3.5" rx="1.75" opacity={FRACO} />
          <rect x="5" y="20" width="7.5" height="9" rx="2" opacity={FORTE} />
          <rect x="14.25" y="20" width="7.5" height="9" rx="2" opacity={FORTE} />
          <rect x="23.5" y="20" width="7.5" height="9" rx="2" opacity={FORTE} />
        </>
      )
    case 'left-stack':
      return (
        <>
          <rect x="4" y="7" width="10" height="2.5" rx="1.25" opacity={FRACO} />
          <rect x="4" y="28" width="14" height="7" rx="2" opacity={FORTE} />
          <rect x="4" y="37" width="14" height="7" rx="2" opacity={FORTE} />
          <rect x="4" y="46" width="14" height="7" rx="2" opacity={FORTE} />
        </>
      )
    case 'right-stack':
      return (
        <>
          <rect x="22" y="7" width="10" height="2.5" rx="1.25" opacity={FRACO} />
          <rect x="18" y="28" width="14" height="7" rx="2" opacity={FORTE} />
          <rect x="18" y="37" width="14" height="7" rx="2" opacity={FORTE} />
          <rect x="18" y="46" width="14" height="7" rx="2" opacity={FORTE} />
        </>
      )
    case 'workout':
      return (
        <>
          <rect x="5" y="7" width="12" height="2.5" rx="1.25" opacity={FRACO} />
          <rect x="5" y="20" width="26" height="3" rx="1.5" opacity={FORTE} />
          <rect x="5" y="26" width="26" height="3" rx="1.5" opacity={FORTE} />
          <rect x="5" y="32" width="26" height="3" rx="1.5" opacity={FORTE} />
          <rect x="5" y="38" width="26" height="3" rx="1.5" opacity={FORTE} />
          <rect x="5" y="44" width="18" height="3" rx="1.5" opacity={FRACO} />
        </>
      )
    case 'live':
      // Espalhados de propósito: é o layout em que o usuário arrasta cada peça.
      return (
        <>
          <rect x="5" y="9" width="11" height="2.5" rx="1.25" opacity={FRACO} />
          <rect x="20" y="18" width="10" height="8" rx="2" opacity={FORTE} />
          <rect x="6" y="30" width="10" height="8" rx="2" opacity={FORTE} />
          <rect x="17" y="44" width="10" height="8" rx="2" opacity={FORTE} />
        </>
      )
    case 'group':
      // Dois blocos irmãos: o layout do treino em dupla.
      return (
        <>
          <rect x="5" y="7" width="12" height="2.5" rx="1.25" opacity={FRACO} />
          <rect x="5" y="22" width="12" height="14" rx="2" opacity={FORTE} />
          <rect x="19" y="22" width="12" height="14" rx="2" opacity={FORTE} />
          <rect x="5" y="42" width="26" height="3" rx="1.5" opacity={FRACO} />
        </>
      )
    case 'bottom-row':
    default:
      return (
        <>
          <rect x="5" y="7" width="12" height="2.5" rx="1.25" opacity={FRACO} />
          <rect x="5" y="36" width="22" height="3.5" rx="1.75" opacity={FRACO} />
          <rect x="5" y="46" width="7.5" height="9" rx="2" opacity={FORTE} />
          <rect x="14.25" y="46" width="7.5" height="9" rx="2" opacity={FORTE} />
          <rect x="23.5" y="46" width="7.5" height="9" rx="2" opacity={FORTE} />
        </>
      )
  }
}

export function LayoutThumb({ id, className }: Props) {
  return (
    <svg
      viewBox={`0 0 ${VB.w} ${VB.h}`}
      className={className}
      // Decorativo: o nome do layout já está no rótulo do botão, e um
      // leitor de tela anunciando "imagem" aqui só duplicaria a informação.
      aria-hidden="true"
      focusable="false"
    >
      <rect x="0.5" y="0.5" width={VB.w - 1} height={VB.h - 1} rx="5" fill="currentColor" opacity="0.06" />
      <g fill="currentColor"><Blocos id={id} /></g>
    </svg>
  )
}
