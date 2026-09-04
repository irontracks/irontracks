'use client'

import React from 'react'
import type { AdvancedConfig, SetDetail } from './types'
import { NumericInput } from '@/components/ui/NumericInput'

interface CardioFieldsProps {
    exercise: {
        name?: string | null
        reps?: string | number | null
        rpe?: number | string | null
    }
    setDetails: SetDetail[]
    onUpdateExercise: (field: 'reps' | 'rpe' | 'sets', value: string) => void
    onUpdateSetDetail: (setIdx: number, patch: Partial<SetDetail>) => void
}

const CARDIO_OPTIONS = ['Escada', 'Esteira', 'Bicicleta', 'Bike Outdoor', 'Corrida', 'Caminhada', 'Elíptico', 'FitDance']

export const CardioFields: React.FC<CardioFieldsProps> = ({
    exercise,
    setDetails,
    onUpdateExercise,
    onUpdateSetDetail,
}) => {
    const cardioSet = setDetails[0]
    const config: AdvancedConfig = (cardioSet?.advanced_config as AdvancedConfig) || {}
    const isHIT = !!config?.isHIT
    const workSec = Number(config?.workSec) || 0
    const restSec = Number(config?.restSec) || 0
    const hitInvalid = isHIT && (workSec <= 0 || restSec >= workSec)

    const updateCardioConfig = (field: string, val: string | number | boolean | null | undefined) => {
        const newConfig = { ...config, [field]: val }
        if (val === '' || val === null || val === undefined) delete newConfig[field]
        if (field === 'isHIT' && !val) {
            delete newConfig.workSec
            delete newConfig.restSec
            delete newConfig.rounds
            delete newConfig.hitIntensity
        }
        onUpdateSetDetail(0, {
            advanced_config: Object.keys(newConfig).length > 0 ? newConfig : null,
        })
    }

    /**
     * BLOCOS — "30 min de esteira" pode ser 5 min a 4 km/h + 10 a 5 + 15 a 6.
     *
     * Cada bloco é uma SÉRIE por baixo (`setDetails[i]`), porque a execução, o
     * cronômetro por bloco, o histórico e a caloria já funcionam por série há
     * tempos — o que faltava era só o editor, que escrevia sempre em
     * `setDetails[0]`. Reusar a série evita um segundo caminho de persistência,
     * que neste repo é a armadilha que já custou campos sumindo em silêncio.
     *
     * Na TELA, porém, isto se chama "bloco" e não "série": é um cardio só que
     * vai subindo a intensidade, não três exercícios (decisão do dono).
     */
    const blocos = setDetails.length > 0 ? setDetails : [{} as SetDetail]
    const emBlocos = blocos.length > 1

    const minutosDoBloco = (b: SetDetail): string => {
        const sec = Number(b?.durationSeconds)
        return Number.isFinite(sec) && sec > 0 ? String(Math.round(sec / 60)) : ''
    }

    const cfgDoBloco = (b: SetDetail): AdvancedConfig =>
        (b?.advanced_config as AdvancedConfig) || {}

    const atualizarBloco = (i: number, campo: 'minutos' | 'speed' | 'incline', valor: number | null) => {
        if (campo === 'minutos') {
            onUpdateSetDetail(i, { durationSeconds: valor != null && valor > 0 ? valor * 60 : null })
            return
        }
        const atual = cfgDoBloco(blocos[i] ?? ({} as SetDetail))
        const proximo: AdvancedConfig = { ...atual, [campo]: valor }
        if (valor == null) delete proximo[campo]
        onUpdateSetDetail(i, { advanced_config: Object.keys(proximo).length > 0 ? proximo : null })
    }

    // O tempo total do exercício continua sendo `reps` (é o que a caloria usa de
    // fallback e o que o resumo mostra) — com blocos ele é a SOMA, não um
    // número digitado à parte que divergiria do que está logo abaixo.
    const totalMinutos = blocos.reduce((soma, b) => {
        const sec = Number(b?.durationSeconds)
        return soma + (Number.isFinite(sec) && sec > 0 ? sec / 60 : 0)
    }, 0)

    const adicionarBloco = () => {
        const novoTotal = blocos.length + 1
        onUpdateExercise('sets', String(novoTotal))
        // O bloco novo nasce herdando a velocidade do anterior: quem monta uma
        // progressão sobe de 4 para 5, não recomeça do vazio.
        const ultimo = blocos[blocos.length - 1]
        const cfgUltimo = cfgDoBloco(ultimo ?? ({} as SetDetail))
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
        onUpdateExercise('sets', String(blocos.length - 1))
    }

    const isBikeOutdoor = String(exercise?.name || '').toLowerCase() === 'bike outdoor'

    return (
        <>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <div className="text-[10px] text-neutral-400 uppercase font-black tracking-wider text-center block mb-1.5">
                        {emBlocos ? 'Tempo total' : isBikeOutdoor ? 'Tempo (min) (opcional)' : 'Tempo (minutos)'}
                    </div>
                    {emBlocos ? (
                        // Com blocos o total é DERIVADO da soma. Deixá-lo editável
                        // criaria dois números para o mesmo fato, e eles divergiriam
                        // no primeiro ajuste de bloco.
                        <div className="w-full bg-depth-2 rounded-2xl p-4 text-center text-xl font-black text-white border border-white/[0.06]">
                            {totalMinutos > 0 ? `${Math.round(totalMinutos)} min` : '—'}
                        </div>
                    ) : (
                        <NumericInput
                            decimal={false}
                            min={isBikeOutdoor ? undefined : 1}
                            aria-label="Tempo em minutos do exercício de cardio"
                            value={exercise.reps ? String(exercise.reps) : ''}
                            onValueChange={(n) => onUpdateExercise('reps', n == null ? '' : String(n))}
                            className="w-full bg-depth-2 rounded-2xl p-4 text-center text-xl font-black text-white outline-none focus:border-yellow-500/60 border border-white/[0.06] placeholder-neutral-700 transition-colors"
                            placeholder={isBikeOutdoor ? 'Livre' : '30'}
                        />
                    )}
                </div>
                <div>
                    <div className="text-[10px] text-yellow-500 uppercase font-black tracking-wider text-center block mb-1.5">Intensidade</div>
                    <NumericInput
                        min="1"
                        aria-label="Intensidade percebida do cardio (RPE)"
                        value={exercise.rpe ? String(exercise.rpe) : ''}
                        onValueChange={(n) => onUpdateExercise('rpe', n == null ? '' : String(n))}
                        className="w-full bg-depth-2 border border-white/[0.06] rounded-2xl p-4 text-center text-xl font-black text-yellow-500 outline-none focus:border-yellow-500/60 placeholder-yellow-500/30 transition-colors"
                        placeholder="5"
                    />
                </div>
            </div>

            {/* ── BLOCOS ─────────────────────────────────────────────────
                "Vou caminhar 30 min: 5 a 4 km/h, 10 a 5, 15 a 6." É UM cardio
                que sobe de intensidade, e por isso a tela fala em BLOCO — série
                é a mecânica por baixo, não a palavra do usuário. */}
            <div className="mt-4 pt-4 border-t border-white/[0.06]">
                <div className="flex items-center justify-between mb-2">
                    <div className="t-meta text-[10px]">
                        {emBlocos ? `Blocos (${blocos.length})` : 'Blocos'}
                    </div>
                    <button
                        type="button"
                        onClick={adicionarBloco}
                        className="tap-44 t-action text-[10px] uppercase tracking-wider text-yellow-500 hover:text-yellow-400 transition-colors px-2 py-1"
                    >
                        + Adicionar bloco
                    </button>
                </div>

                {emBlocos ? (
                    <div className="space-y-2">
                        {blocos.map((b, i) => {
                            const cfg = cfgDoBloco(b)
                            return (
                                <div key={i} className="bg-black/20 border border-white/[0.06] rounded-xl p-2.5">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="t-meta text-[10px]">
                                            Bloco {i + 1}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => removerBloco(i)}
                                            aria-label={`Remover bloco ${i + 1}`}
                                            className="tap-44 t-action text-[10px] uppercase text-red-400/80 hover:text-red-400 transition-colors px-2"
                                        >
                                            Remover
                                        </button>
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

            <div className="mt-4 pt-4 border-t border-white/[0.06]">
                <div className="flex items-center justify-between mb-3">
                    <div className="text-[10px] font-black text-neutral-400 uppercase tracking-wider">Configurações Avançadas</div>
                    <label className="text-[10px] font-black text-white uppercase cursor-pointer select-none flex items-center gap-2">
                        Modo HIT
                        <input
                            type="checkbox"
                            checked={isHIT}
                            onChange={(e) => updateCardioConfig('isHIT', e.target.checked)}
                            className="accent-yellow-500 w-4 h-4"
                            aria-label="Ativar modo HIT"
                        />
                    </label>
                </div>

                {isHIT && (
                    <div className="bg-black/20 p-3 rounded-xl border border-white/[0.06] mb-3 animate-in slide-in-from-top-2">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                                <div className="text-[10px] text-green-400 uppercase font-black tracking-wider block mb-1">Trabalho (s)</div>
                                <NumericInput
                                    decimal={false}
                                    aria-label="Segundos de trabalho no HIT"
                                    value={config.workSec ?? ''}
                                    onValueChange={(n) => updateCardioConfig('workSec', n ?? 0)}
                                    className="w-full bg-depth-1 border border-white/[0.06] rounded-lg p-2 text-sm text-white outline-none focus:border-green-500 placeholder-neutral-700 transition-colors"
                                    placeholder="30"
                                />
                            </div>
                            <div>
                                <div className="text-[10px] text-red-400 uppercase font-black tracking-wider block mb-1">Descanso (s)</div>
                                <NumericInput
                                    decimal={false}
                                    aria-label="Segundos de descanso no HIT"
                                    value={config.restSec ?? ''}
                                    onValueChange={(n) => updateCardioConfig('restSec', n ?? 0)}
                                    className={`w-full bg-depth-1 border rounded-lg p-2 text-sm text-white outline-none focus:border-red-500 placeholder-neutral-700 transition-colors ${hitInvalid ? 'border-red-500/50' : 'border-white/[0.06]'}`}
                                    placeholder="10"
                                />
                            </div>
                            <div>
                                <div className="text-[10px] text-neutral-400 uppercase font-black tracking-wider block mb-1">Rounds</div>
                                <NumericInput
                                    decimal={false}
                                    aria-label="Número de rounds do HIT"
                                    value={config.rounds ?? ''}
                                    onValueChange={(n) => updateCardioConfig('rounds', n ?? 0)}
                                    className="w-full bg-depth-1 border border-white/[0.06] rounded-lg p-2 text-sm text-white outline-none focus:border-yellow-500/60 placeholder-neutral-700 transition-colors"
                                    placeholder="10"
                                />
                            </div>
                            <div>
                                <div className="text-[10px] text-neutral-400 uppercase font-black tracking-wider block mb-1">Nível</div>
                                <select
                                    value={config.hitIntensity ?? 'high'}
                                    onChange={(e) => updateCardioConfig('hitIntensity', e.target.value)}
                                    aria-label="Nível de intensidade do HIT"
                                    className="w-full bg-depth-1 border border-white/[0.06] rounded-lg p-2 text-sm text-white outline-none focus:border-yellow-500/60 h-[38px] transition-colors"
                                >
                                    <option value="low">Baixa</option>
                                    <option value="medium">Média</option>
                                    <option value="high">Alta</option>
                                </select>
                            </div>
                        </div>
                        {hitInvalid && (
                            <div className="mt-2 text-[10px] text-red-400 font-black">
                                ⚠️ O tempo de descanso deve ser menor que o tempo de trabalho.
                            </div>
                        )}
                        {!hitInvalid && workSec > 0 && (
                            <div className="mt-2 text-[10px] text-neutral-400 font-mono text-center">
                                Resumo: {config.rounds || '?'} rounds de {workSec}s ativo / {restSec}s descanso
                            </div>
                        )}
                    </div>
                )}

                <details className="group">
                    <summary className="flex items-center gap-2 text-[10px] font-black text-neutral-400 uppercase tracking-wider cursor-pointer hover:text-yellow-500 transition-colors select-none">
                        <span>Parâmetros de Equipamento</span>
                        <span className="group-open:rotate-180 transition-transform">▼</span>
                    </summary>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 animate-in slide-in-from-top-2 duration-200 bg-black/20 p-3 rounded-xl">
                        <div>
                            <div className="text-[10px] text-neutral-400 uppercase font-black tracking-wider block mb-1">Inclinação (%)</div>
                            <NumericInput
                                aria-label="Inclinação da esteira em porcentagem"
                                value={config.incline ?? ''}
                                onValueChange={(n) => updateCardioConfig('incline', n)}
                                className="w-full bg-depth-1 border border-white/[0.06] rounded-lg p-2 text-sm text-white outline-none focus:border-yellow-500/60 placeholder-neutral-700 transition-colors"
                                placeholder="0"
                            />
                        </div>
                        <div>
                            <div className="text-[10px] text-neutral-400 uppercase font-black tracking-wider block mb-1">Velocidade</div>
                            <NumericInput
                                aria-label="Velocidade em km/h"
                                value={config.speed ?? ''}
                                onValueChange={(n) => updateCardioConfig('speed', n)}
                                className="w-full bg-depth-1 border border-white/[0.06] rounded-lg p-2 text-sm text-white outline-none focus:border-yellow-500/60 placeholder-neutral-700 transition-colors"
                                placeholder="km/h"
                            />
                        </div>
                        <div>
                            <div className="text-[10px] text-neutral-400 uppercase font-black tracking-wider block mb-1">Carga/Nível</div>
                            <NumericInput
                                aria-label="Carga ou nível de resistência do equipamento"
                                value={config.resistance ?? ''}
                                onValueChange={(n) => updateCardioConfig('resistance', n)}
                                className="w-full bg-depth-1 border border-white/[0.06] rounded-lg p-2 text-sm text-white outline-none focus:border-yellow-500/60 placeholder-neutral-700 transition-colors"
                                placeholder="Nível"
                            />
                        </div>
                        <div>
                            <div className="text-[10px] text-neutral-400 uppercase font-black tracking-wider block mb-1">FC Alvo (BPM)</div>
                            <NumericInput
                                decimal={false}
                                aria-label="Frequência cardíaca alvo em BPM"
                                value={config.heart_rate ?? ''}
                                onValueChange={(n) => updateCardioConfig('heart_rate', n)}
                                className="w-full bg-depth-1 border border-white/[0.06] rounded-lg p-2 text-sm text-red-400 font-black outline-none focus:border-red-500 placeholder-neutral-700 transition-colors"
                                placeholder="♥"
                            />
                        </div>
                    </div>
                </details>
            </div>
        </>
    )
}

export { CARDIO_OPTIONS }
