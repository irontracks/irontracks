'use client'

/**
 * AdaptarAmbienteModal — "hoje treino em casa", o treino inteiro num toque.
 *
 * A biblioteca já sabia onde cada exercício dá para fazer (160 `gym`, 83
 * `home`) e o grafo já sabia o que substitui o quê (8.262 arestas). Nada ligava
 * as duas coisas: a troca existia só exercício por exercício.
 *
 * Quem está viajando, de feriado ou diante de uma academia lotada não troca dez
 * exercícios um a um — pula o dia. É esse dia que este modal recupera.
 *
 * **Mostra antes de aplicar, sempre.** Trocar o treino inteiro é ação grande, e
 * o usuário precisa ver o que vai acontecer — inclusive os exercícios que
 * FICAM por não ter alternativa. Silenciar isso faria alguém aplicar achando
 * que o treino virou caseiro e encontrar uma polia no meio.
 */

import { useCallback, useEffect, useState } from 'react'
import { Home, Loader2, ArrowRight, AlertTriangle, Check } from 'lucide-react'
import { FullscreenPortal } from '@/components/stories/FullscreenPortal'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useBackHandler } from '@/hooks/useBackHandler'
import { backdropProps, dialogProps } from '@/utils/a11y/backdrop'
import { createClient } from '@/utils/supabase/client'
import { planejarAdaptacao, resumoDaAdaptacao, type PlanoDeAdaptacao } from '@/lib/workout/adaptarAmbiente'

interface Props {
    open: boolean
    onClose: () => void
    /** Nomes dos exercícios do treino, na ordem. */
    exercicios: string[]
    /** Aplica uma troca — o mesmo `swapExerciseName` da troca individual. */
    aoTrocar: (indice: number, novoNome: string) => void
}

export default function AdaptarAmbienteModal({ open, onClose, exercicios, aoTrocar }: Props) {
    const [carregando, setCarregando] = useState(false)
    const [plano, setPlano] = useState<PlanoDeAdaptacao | null>(null)
    const [erro, setErro] = useState<string | null>(null)
    const [aplicado, setAplicado] = useState(false)
    const focusTrapRef = useFocusTrap(open, onClose)
    useBackHandler(open, onClose)

    useEffect(() => {
        if (!open) { setPlano(null); setErro(null); setAplicado(false); return }
        let cancelado = false
        setCarregando(true)
        void (async () => {
            try {
                const p = await planejarAdaptacao(createClient(), exercicios, 'home')
                if (!cancelado) setPlano(p)
            } catch {
                if (!cancelado) setErro('Não consegui montar as alternativas agora.')
            } finally {
                if (!cancelado) setCarregando(false)
            }
        })()
        return () => { cancelado = true }
    }, [open, exercicios])

    const aplicar = useCallback(() => {
        if (!plano?.trocas.length) return
        // Aplica de trás para a frente não é necessário aqui (a troca é por
        // nome, não move posições), mas a ordem por índice mantém o resultado
        // previsível se `swapExerciseName` mudar de implementação.
        for (const t of plano.trocas) aoTrocar(t.indice, t.para)
        setAplicado(true)
        setTimeout(onClose, 900)
    }, [plano, aoTrocar, onClose])

    if (!open) return null

    return (
        <FullscreenPortal>
            <div className="fixed inset-0 z-[1600] flex items-end justify-center sm:items-center" {...dialogProps('Adaptar treino para casa')}>
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" {...backdropProps(onClose)} />
                <div
                    ref={focusTrapRef}
                    className="relative z-10 flex max-h-[90dvh] w-full max-w-lg flex-col overflow-y-auto rounded-t-3xl border border-white/[0.08] bg-neutral-950 p-4 pb-safe sm:rounded-3xl"
                >
                    <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <Home size={18} className="text-yellow-500" aria-hidden="true" />
                            <div>
                                <h2 className="text-base font-bold text-white">Treinar em casa</h2>
                                {plano && !carregando && (
                                    <p className="mt-0.5 text-xs text-neutral-400">{resumoDaAdaptacao(plano)}</p>
                                )}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="tap-44 shrink-0 rounded-xl border border-white/[0.08] px-3 py-2 text-xs font-semibold text-neutral-300 hover:text-white"
                        >
                            Fechar
                        </button>
                    </div>

                    {carregando && (
                        <p className="flex items-center gap-2 py-8 text-sm text-neutral-400">
                            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                            Procurando alternativas…
                        </p>
                    )}

                    {erro && <p className="py-4 text-sm text-red-300">{erro}</p>}

                    {plano && !carregando && (
                        <>
                            {plano.trocas.map((t) => (
                                <div key={t.indice} className="mb-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
                                    <div className="flex items-center gap-2 text-sm">
                                        <span className="text-neutral-400 line-through">{t.de}</span>
                                        <ArrowRight size={14} className="shrink-0 text-yellow-500" aria-hidden="true" />
                                        <span className="font-bold text-white">{t.para}</span>
                                    </div>
                                    <p className="mt-1 text-[11px] text-neutral-400">
                                        {t.similaridade}% parecido · {t.equipamento}
                                    </p>
                                </div>
                            ))}

                            {plano.semAlternativa.length > 0 && (
                                <div className="mt-2 rounded-2xl border border-yellow-500/20 bg-yellow-500/[0.06] p-3">
                                    <p className="flex items-center gap-1.5 text-xs font-bold text-yellow-200">
                                        <AlertTriangle size={13} aria-hidden="true" />
                                        Sem alternativa em casa — ficam como estão
                                    </p>
                                    <p className="mt-1 text-[11px] text-neutral-300">{plano.semAlternativa.join(' · ')}</p>
                                </div>
                            )}

                            {!plano.trocas.length && !plano.semAlternativa.length && (
                                <p className="py-6 text-sm text-neutral-300">
                                    Seu treino já dá para fazer em casa — nada a trocar.
                                </p>
                            )}

                            {plano.trocas.length > 0 && (
                                <button
                                    type="button"
                                    onClick={aplicar}
                                    disabled={aplicado}
                                    className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-yellow-500 text-sm font-bold text-black transition active:scale-[0.98] disabled:opacity-60"
                                >
                                    {aplicado ? <Check size={16} aria-hidden="true" /> : <Home size={16} aria-hidden="true" />}
                                    {aplicado ? 'Treino adaptado' : `Trocar ${plano.trocas.length} ${plano.trocas.length === 1 ? 'exercício' : 'exercícios'}`}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </FullscreenPortal>
    )
}
