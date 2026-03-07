'use client'

import React from 'react'
import { Trash2 } from 'lucide-react'
import type { AdvancedConfig, SetDetail } from './types'

interface SetDetailsSectionProps {
    setDetails: SetDetail[]
    safeMethod: string
    exerciseIndex: number
    onUpdateSetDetail: (exerciseIdx: number, setIdx: number, patch: Partial<SetDetail>) => void
}

export const SetDetailsSection: React.FC<SetDetailsSectionProps> = ({
    setDetails,
    safeMethod,
    exerciseIndex,
    onUpdateSetDetail,
}) => {
    if (setDetails.length === 0) return null

    return (
        <div className="pt-4 space-y-2">
            <div className="flex items-center justify-between">
                <div className="text-[10px] text-neutral-500 uppercase font-bold">Séries</div>
                <div className="text-[10px] text-neutral-600">{setDetails.length}</div>
            </div>

            {setDetails.map((s, setIdx) => {
                const isWarmup = !!(s?.is_warmup ?? s?.isWarmup)
                const borderClass = isWarmup ? 'border-yellow-500/60' : 'border-neutral-700'
                const config: AdvancedConfig = (s?.advanced_config as AdvancedConfig) ?? (s?.advancedConfig as AdvancedConfig) ?? null
                const isObj = config && typeof config === 'object' && !Array.isArray(config)
                const isDropCfg = Array.isArray(config)
                const isClusterCfg = isObj && (config?.cluster_size != null || config?.intra_rest_sec != null || config?.total_reps != null)
                const isRestPauseCfg = isObj && (config?.mini_sets != null || config?.rest_time_sec != null || config?.initial_reps != null)

                const updateConfig = (nextConfig: AdvancedConfig | AdvancedConfig[] | null) => {
                    onUpdateSetDetail(exerciseIndex, setIdx, { advanced_config: nextConfig })
                }

                return (
                    <div key={setIdx} className={`bg-neutral-900 border ${borderClass} rounded-xl p-3`}>
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="text-xs font-bold text-white">Série {s?.set_number ?? (setIdx + 1)}</div>
                                <label className="flex items-center gap-2 text-[10px] text-neutral-300 font-bold">
                                    {setIdx === 0 && (
                                        <input
                                            type="checkbox"
                                            checked={isWarmup}
                                            onChange={(e) => onUpdateSetDetail(exerciseIndex, setIdx, { is_warmup: !!e.target.checked })}
                                            className="accent-yellow-500"
                                            aria-label="Marcar como série de aquecimento"
                                        />
                                    )}
                                    {setIdx === 0 && 'Série de Aquecimento'}
                                </label>
                            </div>
                            <select
                                aria-label={`Tipo de configuração da série ${setIdx + 1}`}
                                value={isDropCfg ? 'Drop-set' : (config?.type === 'sst' ? 'SST' : (isRestPauseCfg ? 'Rest-Pause' : 'Normal'))}
                                onChange={(e) => {
                                    const val = e.target.value
                                    if (val === 'Normal') updateConfig(null)
                                    else if (val === 'Drop-set') updateConfig([{ weight: null, reps: '' }])
                                    else if (val === 'SST') updateConfig({ type: 'sst', initial_reps: 10, mini_sets: 2, rest_time_sec: 10 })
                                    else if (val === 'Rest-Pause') updateConfig({ initial_reps: 10, mini_sets: 2, rest_time_sec: 20 })
                                }}
                                className="bg-neutral-800 text-[10px] font-bold text-neutral-300 border border-neutral-700 rounded-md px-2 py-1 outline-none focus:border-yellow-500"
                            >
                                <option value="Normal">Normal</option>
                                <option value="Drop-set">Drop Set</option>
                                <option value="SST">SST</option>
                                <option value="Rest-Pause">Rest-Pause</option>
                            </select>
                        </div>

                        {/* Normal set inputs */}
                        {(!isDropCfg && !isClusterCfg && !isRestPauseCfg && (
                            safeMethod === 'Normal' || safeMethod === 'Bi-Set' || safeMethod === 'Rest-Pause' ||
                            safeMethod === 'Drop-set' || safeMethod === 'Cluster'
                        )) && (
                                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    <div>
                                        <label className="text-[10px] text-neutral-500 uppercase font-bold">Carga (kg)</label>
                                        <input
                                            type="number"
                                            aria-label={`Carga em kg para série ${setIdx + 1}`}
                                            value={(s?.weight ?? '')}
                                            onChange={(e) => onUpdateSetDetail(exerciseIndex, setIdx, { weight: e.target.value === '' ? null : Number(e.target.value) })}
                                            className="w-full bg-black/30 border border-neutral-700 rounded-lg p-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-neutral-500 uppercase font-bold">Reps</label>
                                        <input
                                            type="text"
                                            aria-label={`Repetições para série ${setIdx + 1}`}
                                            value={(s?.reps ?? '')}
                                            onChange={(e) => onUpdateSetDetail(exerciseIndex, setIdx, { reps: e.target.value })}
                                            className="w-full bg-black/30 border border-neutral-700 rounded-lg p-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-yellow-500 uppercase font-bold">RPE</label>
                                        <input
                                            type="number"
                                            aria-label={`RPE percebido para série ${setIdx + 1}`}
                                            value={(s?.rpe ?? '')}
                                            onChange={(e) => onUpdateSetDetail(exerciseIndex, setIdx, { rpe: e.target.value === '' ? null : Number(e.target.value) })}
                                            className="w-full bg-black/30 border border-yellow-500/20 rounded-lg p-2 text-sm text-yellow-500 font-bold outline-none focus:ring-1 ring-yellow-500"
                                        />
                                    </div>
                                </div>
                            )}

                        {/* Drop-set */}
                        {(isDropCfg || safeMethod === 'Drop-set') && (
                            <div className="mt-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="text-[10px] text-neutral-500 uppercase font-bold">Drop Set</div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const list: AdvancedConfig[] = Array.isArray(config) ? config : []
                                            updateConfig([...(list || []), { weight: null, reps: '' }])
                                        }}
                                        className="text-[10px] font-bold text-yellow-500 hover:text-yellow-400"
                                        aria-label="Adicionar drop"
                                    >
                                        (+) Add Drop
                                    </button>
                                </div>
                                {(Array.isArray(config) ? config : []).map((d: AdvancedConfig, dIdx: number) => (
                                    <div key={dIdx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                                        <div>
                                            <label className="text-[10px] text-neutral-500 uppercase font-bold">Peso (kg)</label>
                                            <input
                                                type="number"
                                                aria-label={`Peso drop ${dIdx + 1} em kg`}
                                                value={(d?.weight ?? '')}
                                                onChange={(e) => {
                                                    const list = Array.isArray(config) ? [...config] : []
                                                    list[dIdx] = { ...(list[dIdx] || {}), weight: e.target.value === '' ? null : Number(e.target.value) }
                                                    updateConfig(list)
                                                }}
                                                className="w-full bg-black/30 border border-neutral-700 rounded-lg p-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-neutral-500 uppercase font-bold">Reps</label>
                                            <input
                                                type="text"
                                                aria-label={`Reps drop ${dIdx + 1}`}
                                                value={(d?.reps ? String(d.reps) : '')}
                                                onChange={(e) => {
                                                    const list = Array.isArray(config) ? [...config] : []
                                                    list[dIdx] = { ...(list[dIdx] || {}), reps: e.target.value }
                                                    updateConfig(list)
                                                }}
                                                className="w-full bg-black/30 border border-neutral-700 rounded-lg p-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const list = Array.isArray(config) ? [...config] : []
                                                list.splice(dIdx, 1)
                                                updateConfig(list)
                                            }}
                                            className="h-9 w-9 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-300 hover:text-red-400"
                                            aria-label={`Remover drop ${dIdx + 1}`}
                                        >
                                            <Trash2 size={14} className="mx-auto" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Rest-Pause / SST */}
                        {(isRestPauseCfg || safeMethod === 'Rest-Pause' || config?.type === 'sst') && !isDropCfg && config && typeof config === 'object' && (
                            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <div className="col-span-full mb-1">
                                    <span className="text-[10px] uppercase font-bold text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded">
                                        Configuração {config?.type === 'sst' ? 'SST' : 'Rest-Pause'}
                                    </span>
                                </div>
                                <div>
                                    <label className="text-[10px] text-neutral-500 uppercase font-bold">Carga</label>
                                    <input type="number" aria-label="Carga em kg" value={(config?.weight ?? '')}
                                        onChange={(e) => updateConfig({ ...(config && typeof config === 'object' ? config : {}), weight: e.target.value === '' ? null : Number(e.target.value) })}
                                        className="w-full bg-black/30 border border-neutral-700 rounded-lg p-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                </div>
                                <div>
                                    <label className="text-[10px] text-neutral-500 uppercase font-bold">Reps Iniciais</label>
                                    <input type="number" aria-label="Repetições iniciais" value={(config?.initial_reps ?? '')}
                                        onChange={(e) => updateConfig({ ...(config && typeof config === 'object' ? config : {}), initial_reps: e.target.value === '' ? null : Number(e.target.value) })}
                                        className="w-full bg-black/30 border border-neutral-700 rounded-lg p-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                </div>
                                <div>
                                    <label className="text-[10px] text-neutral-500 uppercase font-bold">Pausa (s)</label>
                                    <input type="number" aria-label="Pausa em segundos" value={(config?.rest_time_sec ?? '')}
                                        onChange={(e) => updateConfig({ ...(config && typeof config === 'object' ? config : {}), rest_time_sec: e.target.value === '' ? null : Number(e.target.value) })}
                                        className="w-full bg-black/30 border border-neutral-700 rounded-lg p-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                </div>
                                <div>
                                    <label className="text-[10px] text-neutral-500 uppercase font-bold">Mini-sets</label>
                                    <input type="number" aria-label="Número de mini-sets" value={(config?.mini_sets ?? '')}
                                        onChange={(e) => updateConfig({ ...(config && typeof config === 'object' ? config : {}), mini_sets: e.target.value === '' ? null : Number(e.target.value) })}
                                        className="w-full bg-black/30 border border-neutral-700 rounded-lg p-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                </div>
                            </div>
                        )}

                        {/* Cluster */}
                        {(isClusterCfg || safeMethod === 'Cluster') && !isDropCfg && (
                            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <div>
                                    <label className="text-[10px] text-neutral-500 uppercase font-bold">Carga</label>
                                    <input type="number" aria-label="Carga cluster em kg" value={(config?.weight ?? '')}
                                        onChange={(e) => updateConfig({ ...(config && typeof config === 'object' ? config : {}), weight: e.target.value === '' ? null : Number(e.target.value) })}
                                        className="w-full bg-black/30 border border-neutral-700 rounded-lg p-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                </div>
                                <div>
                                    <label className="text-[10px] text-neutral-500 uppercase font-bold">Total Reps</label>
                                    <input type="number" aria-label="Total de repetições do cluster" value={(config?.total_reps ?? '')}
                                        onChange={(e) => updateConfig({ ...(config && typeof config === 'object' ? config : {}), total_reps: e.target.value === '' ? null : Number(e.target.value) })}
                                        className="w-full bg-black/30 border border-neutral-700 rounded-lg p-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                </div>
                                <div>
                                    <label className="text-[10px] text-neutral-500 uppercase font-bold">Cluster</label>
                                    <input type="number" aria-label="Tamanho do cluster" value={(config?.cluster_size ?? '')}
                                        onChange={(e) => updateConfig({ ...(config && typeof config === 'object' ? config : {}), cluster_size: e.target.value === '' ? null : Number(e.target.value) })}
                                        className="w-full bg-black/30 border border-neutral-700 rounded-lg p-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                </div>
                                <div>
                                    <label className="text-[10px] text-neutral-500 uppercase font-bold">Intra (s)</label>
                                    <input type="number" aria-label="Descanso intra-cluster em segundos" value={(config?.intra_rest_sec ?? '')}
                                        onChange={(e) => updateConfig({ ...(config && typeof config === 'object' ? config : {}), intra_rest_sec: e.target.value === '' ? null : Number(e.target.value) })}
                                        className="w-full bg-black/30 border border-neutral-700 rounded-lg p-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                </div>
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
