'use client'

import React from 'react'
import type { AdvancedConfig, SetDetail } from './types'
import { NumericInput } from '@/components/ui/NumericInput'

/**
 * BLOCOS de cardio — "30 min de esteira" pode ser 5 min a 4 km/h + 10 a 5 + 15 a 6.
 *
 * Cada bloco é uma SÉRIE por baixo (`setDetails[i]`), porque a execução, o
 * cronômetro por bloco, o histórico e a caloria já funcionam por série há tempos.
 * Na TELA isto se chama "bloco" e não "série": é um cardio só que vai subindo a
 * intensidade, não três exercícios (decisão do dono).
 *
 * ⚠️ Este componente é FONTE ÚNICA para as DUAS superfícies que editam cardio: o
 * editor completo (`CardioFields`) e o modal rápido do lápis do card no treino
 * ativo (`workout/Modals.tsx`). Ele nasceu extraído do primeiro em 09/09/2026,
 * quando o dono perguntou "cadê os blocos?" — a feature existia desde o #1063 e
 * morava só no editor completo, enquanto o botão que a mão alcança no meio do
 * treino é o do card. Duplicar o JSX aqui seria a mesma deriva que já custou 14
 * renderers de série neste repo: mexeu no bloco, mexa NESTE arquivo.
 */
/**
 * O que um bloco precisa TER para este editor funcionar. Deliberadamente menor
 * que `SetDetail`: o rascunho do modal rápido carrega só estes dois campos, e
 * exigir a série inteira ali obrigaria a inventar `reps`/`rpe`/`weight` que o
 * cardio não usa. `SetDetail[]` continua atribuível, então o editor completo
 * passa o que já tem.
 */
export type BlocoDeCardio = Pick<SetDetail, 'durationSeconds' | 'advanced_config'>

export interface CardioBlocosEditorProps {
    /** Séries do exercício. Lista vazia é tratada como um bloco em branco. */
    setDetails: readonly BlocoDeCardio[]
    /** Grava um patch na série `i` (cria se não existir). */
    onUpdateSetDetail: (setIdx: number, patch: Partial<SetDetail>) => void
    /** Ajusta a contagem de séries do exercício — o nº de blocos manda nela. */
    onUpdateSetsCount: (total: number) => void
    /** Teto de blocos, para o editor não passar do limite de séries do chamador. */
    maxBlocos?: number
    /**
     * Desenha os campos mesmo com UM bloco só.
     *
     * No editor completo o padrão é `false`: lá, o bloco único já é editável
     * pelos campos gerais ("Tempo (minutos)" e Parâmetros de Equipamento), e
     * listá-lo daria dois lugares para o mesmo número. No modal rápido do card
     * esses campos gerais não existem — sem isto, quem tem um bloco só via a
     * dica e nada para preencher.
     */
    sempreMostrarCampos?: boolean
}

export const minutosDoBloco = (b: BlocoDeCardio | undefined): string => {
    const sec = Number(b?.durationSeconds)
    return Number.isFinite(sec) && sec > 0 ? String(Math.round(sec / 60)) : ''
}

export const cfgDoBloco = (b: BlocoDeCardio | undefined): AdvancedConfig =>
    (b?.advanced_config as AdvancedConfig) || {}

/** Soma dos minutos declarados nos blocos. É o "Tempo total" derivado. */
export const totalMinutosDosBlocos = (blocos: readonly BlocoDeCardio[]): number =>
    blocos.reduce((soma, b) => {
        const sec = Number(b?.durationSeconds)
        return soma + (Number.isFinite(sec) && sec > 0 ? sec / 60 : 0)
    }, 0)

export const CardioBlocosEditor: React.FC<CardioBlocosEditorProps> = ({
    setDetails,
    onUpdateSetDetail,
    onUpdateSetsCount,
    maxBlocos = 20,
    sempreMostrarCampos = false,
}) => {
    const blocos: readonly BlocoDeCardio[] = setDetails.length > 0 ? setDetails : [{}]
    const emBlocos = blocos.length > 1 || sempreMostrarCampos

    const atualizarBloco = (i: number, campo: 'minutos' | 'speed' | 'incline', valor: number | null) => {
        if (campo === 'minutos') {
            onUpdateSetDetail(i, { durationSeconds: valor != null && valor > 0 ? valor * 60 : null })
            return
        }
        const atual = cfgDoBloco(blocos[i])
        const proximo: AdvancedConfig = { ...atual, [campo]: valor }
        if (valor == null) delete proximo[campo]
        onUpdateSetDetail(i, { advanced_config: Object.keys(proximo).length > 0 ? proximo : null })
    }

    const adicionarBloco = () => {
        if (blocos.length >= maxBlocos) return
        onUpdateSetsCount(blocos.length + 1)
        // O bloco novo nasce herdando a velocidade do anterior: quem monta uma
        // progressão sobe de 4 para 5, não recomeça do vazio.
        const cfgUltimo = cfgDoBloco(blocos[blocos.length - 1])
        onUpdateSetDetail(blocos.length, {
            durationSeconds: null,
            advanced_config: cfgUltimo.speed != null ? { speed: cfgUltimo.speed } : null,
        })
    }

    const removerBloco = (i: number) => {
        if (blocos.length <= 1) return
        // Compacta: puxa cada bloco seguinte uma posição para trás e encurta a
        // lista. Sem isso, remover o do meio deixaria um buraco.
        for (let j = i; j < blocos.length - 1; j++) {
            const prox = blocos[j + 1]
            onUpdateSetDetail(j, {
                durationSeconds: prox?.durationSeconds ?? null,
                advanced_config: (prox?.advanced_config as AdvancedConfig) ?? null,
            })
        }
        onUpdateSetsCount(blocos.length - 1)
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <div className="t-meta text-[10px]">
                    {blocos.length > 1 ? `Blocos (${blocos.length})` : 'Blocos'}
                </div>
                {blocos.length < maxBlocos && (
                    <button
                        type="button"
                        onClick={adicionarBloco}
                        className="tap-44 t-action text-[10px] uppercase tracking-wider text-yellow-500 hover:text-yellow-400 transition-colors px-2 py-1"
                    >
                        + Adicionar bloco
                    </button>
                )}
            </div>

            {emBlocos ? (
                <div className="space-y-2">
                    {blocos.map((b, i) => {
                        const cfg = cfgDoBloco(b)
                        return (
                            <div key={i} className="bg-black/20 border border-white/[0.06] rounded-xl p-2.5">
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="t-meta text-[10px]">Bloco {i + 1}</span>
                                    {/* Com um bloco só não há o que remover — o
                                        botão abriria um caminho que o
                                        `removerBloco` recusa, e recusa em
                                        silêncio. */}
                                    {blocos.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removerBloco(i)}
                                            aria-label={`Remover bloco ${i + 1}`}
                                            className="tap-44 t-action text-[10px] uppercase text-red-400/80 hover:text-red-400 transition-colors px-2"
                                        >
                                            Remover
                                        </button>
                                    )}
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    <div>
                                        <div className="t-meta text-[10px] mb-1">Min</div>
                                        <NumericInput
                                            decimal={false}
                                            min={1}
                                            aria-label={`Minutos do bloco ${i + 1}`}
                                            value={minutosDoBloco(b)}
                                            onValueChange={(n) => atualizarBloco(i, 'minutos', n)}
                                            className="w-full bg-depth-1 border border-white/[0.06] rounded-lg p-2 text-sm text-center text-white outline-none focus:border-yellow-500/60 placeholder-neutral-700 transition-colors"
                                            placeholder="5"
                                        />
                                    </div>
                                    <div>
                                        <div className="t-meta text-[10px] mb-1">km/h</div>
                                        <NumericInput
                                            aria-label={`Velocidade do bloco ${i + 1}`}
                                            value={cfg.speed ?? ''}
                                            onValueChange={(n) => atualizarBloco(i, 'speed', n)}
                                            className="w-full bg-depth-1 border border-white/[0.06] rounded-lg p-2 text-sm text-center text-white outline-none focus:border-yellow-500/60 placeholder-neutral-700 transition-colors"
                                            placeholder="4,0"
                                        />
                                    </div>
                                    <div>
                                        <div className="t-meta text-[10px] mb-1">Incl. %</div>
                                        <NumericInput
                                            aria-label={`Inclinação do bloco ${i + 1}`}
                                            value={cfg.incline ?? ''}
                                            onValueChange={(n) => atualizarBloco(i, 'incline', n)}
                                            className="w-full bg-depth-1 border border-white/[0.06] rounded-lg p-2 text-sm text-center text-white outline-none focus:border-yellow-500/60 placeholder-neutral-700 transition-colors"
                                            placeholder="0"
                                        />
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                    <div className="text-[10px] text-neutral-400 font-mono text-center pt-1">
                        {blocos
                            .map((b) => {
                                const min = minutosDoBloco(b)
                                const sp = cfgDoBloco(b).speed
                                return min ? `${min}min${sp != null ? ` @ ${sp}` : ''}` : null
                            })
                            .filter(Boolean)
                            .join('  →  ') || 'Preencha os blocos'}
                    </div>
                </div>
            ) : (
                <p className="text-[11px] text-neutral-400 leading-relaxed">
                    Um bloco só. Use blocos para subir a intensidade no meio —
                    ex.: 5 min a 4,0 · 10 min a 5,0 · 15 min a 6,0.
                </p>
            )}
        </div>
    )
}
