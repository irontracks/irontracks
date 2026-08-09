/**
 * @module a11y/backdrop
 *
 * Props do fundo escurecido de um modal ("backdrop"), com fechamento por
 * teclado além do clique.
 *
 * O padrão do repo era `<div className="fixed inset-0 …" onClick={fechar}>` e
 * um `eslint-disable` de `jsx-a11y` logo acima — 16 vezes. Clicar fora fechava;
 * quem navega por teclado ficava sem a saída equivalente, e o `Escape` (o que
 * qualquer pessoa aperta primeiro) não fazia nada.
 *
 * Uso:
 *   <div className="fixed inset-0 …" {...backdropProps(fechar)}>
 *     <div onClick={(e) => e.stopPropagation()}> … conteúdo … </div>
 *   </div>
 *
 * `tabIndex={-1}`: o backdrop é alcançável por foco programático, mas fica
 * FORA da ordem de Tab — ele não é um controle que a pessoa queira tabular,
 * só um alvo para o Escape e para o clique fora.
 *
 * LIMITE conhecido: o `Escape` chega aqui por BORBULHA, então depende de o foco
 * estar dentro do modal — o caso normal, já que o conteúdo tem botões e campos.
 * Modal aberto sem nada focado precisa de listener no documento; vários já
 * resolvem isso com `useBackHandler`.
 */
import type { KeyboardEvent, MouseEvent } from 'react'

export interface BackdropProps {
    role: 'presentation'
    tabIndex: -1
    'aria-label': string
    onClick: (e: MouseEvent<HTMLElement>) => void
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => void
}

export function backdropProps(onClose: () => void, label = 'Fechar'): BackdropProps {
    return {
        // `presentation` e não `button`: o backdrop não é um botão de verdade —
        // anunciá-lo como tal faria o leitor de tela prometer uma ação que o
        // conteúdo do modal já oferece pelo X.
        role: 'presentation',
        tabIndex: -1,
        'aria-label': label,
        // `e.target === e.currentTarget`: só o clique no PRÓPRIO backdrop fecha.
        // Sem esse guard, um clique dentro do modal borbulha até aqui e fecha a
        // janela no meio da interação — hoje isso é evitado por um
        // `stopPropagation()` no filho, que é fácil de esquecer no próximo modal.
        onClick: (e) => { if (e.target === e.currentTarget) onClose() },
        onKeyDown: (e) => {
            if (e.key !== 'Escape') return
            // Só o backdrop do topo responde: sem isto, um modal aberto sobre
            // outro fecharia os dois com um Escape só.
            e.stopPropagation()
            onClose()
        },
    }
}
