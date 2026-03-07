'use client'

import React from 'react'
import type { AdvancedConfig, SetDetail } from './types'

interface CardioFieldsProps {
    exercise: {
        name?: string | null
        reps?: string | number | null
        rpe?: number | string | null
    }
    setDetails: SetDetail[]
    onUpdateExercise: (field: 'reps' | 'rpe', value: string) => void
    onUpdateSetDetail: (setIdx: number, patch: Partial<SetDetail>) => void
}

const CARDIO_OPTIONS = ['Escada', 'Esteira', 'Bicicleta', 'Bike Outdoor', 'Corrida', 'Caminhada', 'Elíptico']

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

    const isBikeOutdoor = String(exercise?.name || '').toLowerCase() === 'bike outdoor'

    return (
        <>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-[10px] text-neutral-500 uppercase font-bold text-center block mb-1">
                        {isBikeOutdoor ? 'Tempo (minutos) (opcional)' : 'Tempo (minutos)'}
                    </label>
                    <input
                        type="number"
                        min={isBikeOutdoor ? undefined : 1}
                        aria-label="Tempo em minutos do exercício de cardio"
                        value={exercise.reps ? String(exercise.reps) : ''}
                        onChange={(e) => onUpdateExercise('reps', e.target.value)}
                        className="w-full bg-neutral-900 rounded-xl p-4 text-center text-xl font-bold text-white outline-none focus:ring-1 ring-blue-500 border border-neutral-700"
                        placeholder={isBikeOutdoor ? 'Livre' : '30'}
                    />
                </div>
                <div>
                    <label className="text-[10px] text-yellow-500 uppercase font-bold text-center block mb-1">Intensidade</label>
                    <input
                        type="number"
                        min="1"
                        aria-label="Intensidade percebida do cardio (RPE)"
                        value={exercise.rpe ? String(exercise.rpe) : ''}
                        onChange={(e) => onUpdateExercise('rpe', e.target.value)}
                        className="w-full bg-neutral-900 border border-yellow-500/20 rounded-xl p-4 text-center text-xl font-bold text-yellow-500 outline-none focus:ring-1 ring-yellow-500 placeholder-yellow-500/30"
                        placeholder="5"
                    />
                </div>
            </div>

            <div className="mt-4 pt-4 border-t border-neutral-800">
                <div className="flex items-center justify-between mb-3">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase">Configurações Avançadas</label>
                    <label className="text-[10px] font-bold text-white uppercase cursor-pointer select-none flex items-center gap-2">
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
                    <div className="bg-neutral-900/50 p-3 rounded-xl border border-neutral-800 mb-3 animate-in slide-in-from-top-2">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                                <label className="text-[10px] text-green-400 uppercase font-bold block mb-1">Trabalho (s)</label>
                                <input
                                    type="number"
                                    aria-label="Segundos de trabalho no HIT"
                                    value={config.workSec ?? ''}
                                    onChange={(e) => updateCardioConfig('workSec', Number(e.target.value))}
                                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-sm text-white outline-none focus:border-green-500 placeholder-neutral-700"
                                    placeholder="30"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] text-red-400 uppercase font-bold block mb-1">Descanso (s)</label>
                                <input
                                    type="number"
                                    aria-label="Segundos de descanso no HIT"
                                    value={config.restSec ?? ''}
                                    onChange={(e) => updateCardioConfig('restSec', Number(e.target.value))}
                                    className={`w-full bg-neutral-900 border rounded-lg p-2 text-sm text-white outline-none focus:border-red-500 placeholder-neutral-700 ${hitInvalid ? 'border-red-500/50' : 'border-neutral-700'}`}
                                    placeholder="10"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] text-neutral-400 uppercase font-bold block mb-1">Rounds</label>
                                <input
                                    type="number"
                                    aria-label="Número de rounds do HIT"
                                    value={config.rounds ?? ''}
                                    onChange={(e) => updateCardioConfig('rounds', Number(e.target.value))}
                                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-sm text-white outline-none focus:border-yellow-500 placeholder-neutral-700"
                                    placeholder="10"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] text-neutral-400 uppercase font-bold block mb-1">Nível</label>
                                <select
                                    value={config.hitIntensity ?? 'high'}
                                    onChange={(e) => updateCardioConfig('hitIntensity', e.target.value)}
                                    aria-label="Nível de intensidade do HIT"
                                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-sm text-white outline-none focus:border-yellow-500 h-[38px]"
                                >
                                    <option value="low">Baixa</option>
                                    <option value="medium">Média</option>
                                    <option value="high">Alta</option>
                                </select>
                            </div>
                        </div>
                        {hitInvalid && (
                            <div className="mt-2 text-[10px] text-red-400 font-bold">
                                ⚠️ O tempo de descanso deve ser menor que o tempo de trabalho.
                            </div>
                        )}
                        {!hitInvalid && workSec > 0 && (
                            <div className="mt-2 text-[10px] text-neutral-500 font-mono text-center">
                                Resumo: {config.rounds || '?'} rounds de {workSec}s ativo / {restSec}s descanso
                            </div>
                        )}
                    </div>
                )}

                <details className="group">
                    <summary className="flex items-center gap-2 text-[10px] font-bold text-neutral-500 uppercase cursor-pointer hover:text-yellow-500 transition-colors select-none">
                        <span>Parâmetros de Equipamento</span>
                        <span className="group-open:rotate-180 transition-transform">▼</span>
                    </summary>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 animate-in slide-in-from-top-2 duration-200 bg-neutral-900/30 p-3 rounded-xl">
                        <div>
                            <label className="text-[10px] text-neutral-500 uppercase font-bold block mb-1">Inclinação (%)</label>
                            <input
                                type="number"
                                aria-label="Inclinação da esteira em porcentagem"
                                value={config.incline ?? ''}
                                onChange={(e) => updateCardioConfig('incline', e.target.value)}
                                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-sm text-white outline-none focus:border-yellow-500 placeholder-neutral-700"
                                placeholder="0"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-neutral-500 uppercase font-bold block mb-1">Velocidade</label>
                            <input
                                type="number"
                                step="0.1"
                                aria-label="Velocidade em km/h"
                                value={config.speed ?? ''}
                                onChange={(e) => updateCardioConfig('speed', e.target.value)}
                                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-sm text-white outline-none focus:border-yellow-500 placeholder-neutral-700"
                                placeholder="km/h"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-neutral-500 uppercase font-bold block mb-1">Carga/Nível</label>
                            <input
                                type="number"
                                aria-label="Carga ou nível de resistência do equipamento"
                                value={config.resistance ?? ''}
                                onChange={(e) => updateCardioConfig('resistance', e.target.value)}
                                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-sm text-white outline-none focus:border-yellow-500 placeholder-neutral-700"
                                placeholder="Nível"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-neutral-500 uppercase font-bold block mb-1">FC Alvo (BPM)</label>
                            <input
                                type="number"
                                aria-label="Frequência cardíaca alvo em BPM"
                                value={config.heart_rate ?? ''}
                                onChange={(e) => updateCardioConfig('heart_rate', e.target.value)}
                                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-sm text-red-400 font-bold outline-none focus:border-red-500 placeholder-neutral-700"
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
