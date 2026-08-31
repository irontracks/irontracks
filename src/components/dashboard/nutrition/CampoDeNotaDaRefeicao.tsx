'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_NOTA_DA_REFEICAO } from '@/lib/nutrition/dietPlanShape'

/**
 * O campo de observação/orientação de UMA refeição — um componente só para as
 * duas superfícies que editam (o plano do usuário e o painel do professor).
 *
 * Nasceu de uma revisão de design: as duas telas tinham o mesmo `<textarea>`
 * copiado, e já **discordavam** sobre a pergunta que mais importa num campo de
 * formulário — *o que acontece quando ele está vazio?*. O card do aluno escondia
 * o bloco sem nota; as duas telas de edição mostravam uma caixa vazia sempre. No
 * painel do professor, que lista as refeições todas abertas, isso somava **~310px
 * de caixas vazias** num plano de 6 refeições, para um campo que na maioria delas
 * nunca será preenchido.
 *
 * Regra: **sem nota, o campo é um convite de uma linha**; com nota (ou enquanto
 * se edita), é o campo. O peso visual acompanha o conteúdo que existe.
 */
export function CampoDeNotaDaRefeicao({
    nota,
    nomeDaRefeicao,
    rotulo,
    placeholder,
    salvando,
    erro,
    onSalvar,
}: {
    /** O que está gravado hoje. Vazio/ausente = ainda não existe nota. */
    nota: string
    /** Entra no `aria-label`: com vários campos iguais na tela, um rótulo
     *  genérico faria o leitor de tela anunciar N vezes a mesma coisa. */
    nomeDaRefeicao: string
    /** Texto do convite quando não há nota. */
    rotulo: string
    placeholder: string
    salvando: boolean
    /** Falha desta refeição — fica JUNTO do campo, não no topo da lista. */
    erro?: string | null
    /**
     * Recebe o texto já aparado; vazio significa apagar. **Devolve `false`
     * quando a gravação falhou** — e aí o campo NÃO colapsa: colapsar levaria
     * junto o texto que a pessoa acabou de escrever, que não existe em nenhum
     * outro lugar. (Pego por teste antes de ir ao ar.)
     */
    onSalvar: (texto: string) => Promise<boolean> | boolean
}) {
    const [aberto, setAberto] = useState(false)
    const [rascunho, setRascunho] = useState<string | null>(null)
    const campoRef = useRef<HTMLTextAreaElement | null>(null)

    // Foco PROGRAMÁTICO, não `autoFocus`: aqui o foco é consequência de um toque
    // deliberado no convite ("+ Observação"), então roubá-lo é o esperado — sem
    // isso a pessoa toca no botão e precisa tocar de novo no campo. O `autoFocus`
    // do JSX é o que a regra de a11y proíbe, porque ele dispara na montagem.
    useEffect(() => {
        if (aberto) campoRef.current?.focus()
    }, [aberto])

    const temNota = Boolean(nota.trim())
    const editando = aberto || temNota

    const aoSair = useCallback(async () => {
        // Sem rascunho, o campo mostra o que já está salvo — sair dele não é
        // edição. Tratar `null` como '' apagaria a nota de quem só passou o dedo.
        if (rascunho === null || rascunho.trim() === nota.trim()) {
            setRascunho(null)
            setAberto(false)
            return
        }
        const gravou = await onSalvar(rascunho.trim())
        if (gravou === false) return // mantém aberto, com o texto na tela
        setRascunho(null)
        setAberto(false)
    }, [rascunho, nota, onSalvar])

    if (!editando) {
        return (
            <button
                type="button"
                onClick={() => setAberto(true)}
                className="tap-44 mt-2 inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-[11px] font-semibold text-neutral-400 transition hover:text-neutral-200 active:scale-[0.98]"
            >
                <span aria-hidden="true" className="text-sm leading-none">+</span>
                {rotulo}
            </button>
        )
    }

    return (
        <div className="mt-2">
            <textarea
                aria-label={`${rotulo} — ${nomeDaRefeicao}`}
                value={rascunho ?? nota}
                onChange={(e) => setRascunho(e.target.value.slice(0, MAX_NOTA_DA_REFEICAO))}
                onBlur={() => void aoSair()}
                ref={campoRef}
                rows={2}
                maxLength={MAX_NOTA_DA_REFEICAO}
                disabled={salvando}
                placeholder={placeholder}
                // Campo de entrada é MAIS CLARO que o card, nunca mais escuro:
                // em dark mode "mais escuro que o entorno" lê como buraco ou
                // desabilitado. Este é o mesmo tom dos outros inputs da tela.
                className="w-full resize-none rounded-lg border border-neutral-700/50 bg-neutral-800/60 px-2.5 py-2 text-[11px] leading-relaxed text-white placeholder:text-neutral-400 outline-none transition focus:border-yellow-500/40 disabled:opacity-60"
            />
            {/* Altura reservada: sem isto o indicador entra e sai do fluxo e
                empurra o botão de baixo a cada gravação. */}
            <span className="mt-0.5 block h-3.5 text-[10px] leading-none text-neutral-400">
                {salvando ? 'salvando…' : ''}
            </span>
            {erro ? <p className="mt-1 text-[10px] leading-relaxed text-red-300">{erro}</p> : null}
        </div>
    )
}

export default CampoDeNotaDaRefeicao
