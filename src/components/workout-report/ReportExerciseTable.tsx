'use client'

import React from 'react'

type AnyObj = Record<string, unknown>

interface ReportExerciseTableProps {
  exercises: unknown[]
  historicalBestE1rm: Record<string, number>
}

export function ReportExerciseTable({ exercises, historicalBestE1rm }: ReportExerciseTableProps) {
  if (!Array.isArray(exercises) || exercises.length === 0) return null

  return (
    <div className="mb-8 p-4 rounded-xl border border-neutral-800 bg-neutral-900/60">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Ordem e execução</div>
          <div className="text-lg font-black text-white">Detalhe por exercício</div>
          <div className="text-xs text-neutral-300">Ordem, descanso e volume executado.</div>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-neutral-950 text-neutral-400 uppercase text-[10px] font-bold">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Exercício</th>
              <th className="px-3 py-2 text-center">Séries</th>
              <th className="px-3 py-2 text-center">Reps</th>
              <th className="px-3 py-2 text-center">Execução</th>
              <th className="px-3 py-2 text-center">Descanso (real)</th>
              <th className="px-3 py-2 text-center">Descanso (plan)</th>
              <th className="px-3 py-2 text-right">Peso médio</th>
              <th className="px-3 py-2 text-right">Volume</th>
              <th className="px-3 py-2 text-right">Δ Volume</th>
              <th className="px-3 py-2 text-right">Δ Reps</th>
              <th className="px-3 py-2 text-right">Δ Peso</th>
              <th className="px-3 py-2 text-right">Δ 1RM</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {exercises.map((raw, idx) => {
              const ex = raw && typeof raw === 'object' ? (raw as AnyObj) : null
              if (!ex) return null
              const name = String(ex.name || '').trim() || '—'
              const order = Number(ex.order || idx + 1)
              const setsDone = Number(ex.setsDone || 0)
              const repsDone = Number(ex.repsDone || 0)
              const executionMinutes = Number(ex.executionMinutes || 0)
              const restMinutes = Number(ex.restMinutes || 0)
              const rest = Number(ex.restTimePlannedSec || 0)
              const avgWeight = Number(ex.avgWeightKg || 0)
              const volume = Number(ex.volumeKg || 0)
              const deltaVolume = ex.delta && typeof ex.delta === 'object' ? Number((ex.delta as AnyObj).volumeKg) : NaN
              const deltaReps = ex.delta && typeof ex.delta === 'object' ? Number((ex.delta as AnyObj).reps) : NaN
              const deltaWeight = ex.delta && typeof ex.delta === 'object' ? Number((ex.delta as AnyObj).avgWeightKg) : NaN
              const deltaVolumeLabel = Number.isFinite(deltaVolume) ? `${deltaVolume > 0 ? '+' : ''}${deltaVolume.toFixed(1)} kg` : '—'
              const deltaRepsLabel = Number.isFinite(deltaReps) ? `${deltaReps > 0 ? '+' : ''}${Math.round(deltaReps)}` : '—'
              const deltaWeightLabel = Number.isFinite(deltaWeight) ? `${deltaWeight > 0 ? '+' : ''}${deltaWeight.toFixed(1)} kg` : '—'
              const deltaVolumeClass = Number.isFinite(deltaVolume) && deltaVolume < 0 ? 'text-red-300' : 'text-emerald-300'
              const deltaRepsClass = Number.isFinite(deltaReps) && deltaReps < 0 ? 'text-red-300' : 'text-emerald-300'
              const deltaWeightClass = Number.isFinite(deltaWeight) && deltaWeight < 0 ? 'text-red-300' : 'text-emerald-300'
              return (
                <tr key={`${name}-${idx}`} className="hover:bg-neutral-800/40">
                  <td className="px-3 py-2 font-mono text-neutral-300">{Number.isFinite(order) ? order : idx + 1}</td>
                  <td className="px-3 py-2 font-semibold text-white">{name}</td>
                  <td className="px-3 py-2 text-center font-mono text-neutral-300">{Number.isFinite(setsDone) && setsDone > 0 ? setsDone : '—'}</td>
                  <td className="px-3 py-2 text-center font-mono text-neutral-300">{Number.isFinite(repsDone) && repsDone > 0 ? repsDone : '—'}</td>
                  <td className="px-3 py-2 text-center font-mono text-neutral-300">{Number.isFinite(executionMinutes) && executionMinutes > 0 ? `${executionMinutes.toFixed(1)} min` : '—'}</td>
                  <td className="px-3 py-2 text-center font-mono text-neutral-300">{Number.isFinite(restMinutes) && restMinutes > 0 ? `${restMinutes.toFixed(1)} min` : '—'}</td>
                  <td className="px-3 py-2 text-center font-mono text-neutral-300">{Number.isFinite(rest) && rest > 0 ? `${Math.round(rest)}s` : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono text-neutral-200">{Number.isFinite(avgWeight) && avgWeight > 0 ? `${avgWeight.toFixed(1)} kg` : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono text-neutral-200">{Number.isFinite(volume) && volume > 0 ? `${volume.toLocaleString('pt-BR')} kg` : '—'}</td>
                  <td className={`px-3 py-2 text-right font-mono ${Number.isFinite(deltaVolume) ? deltaVolumeClass : 'text-neutral-500'}`}>{deltaVolumeLabel}</td>
                  <td className={`px-3 py-2 text-right font-mono ${Number.isFinite(deltaReps) ? deltaRepsClass : 'text-neutral-500'}`}>{deltaRepsLabel}</td>
                  <td className={`px-3 py-2 text-right font-mono ${Number.isFinite(deltaWeight) ? deltaWeightClass : 'text-neutral-500'}`}>{deltaWeightLabel}</td>
                  <td className="px-3 py-2 text-right font-mono text-blue-300 text-xs">
                    {(() => {
                      const key = String(name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()
                      const hist = historicalBestE1rm[key]
                      if (!hist || hist <= 0) return '—'
                      const avgW = Number(ex.avgWeightKg || 0)
                      const avgR = Number(ex.repsDone || 0) / Math.max(1, Number(ex.setsDone || 1))
                      const curE1rm = avgW > 0 && avgR > 0 ? avgW * (1 + avgR / 30) : 0
                      if (curE1rm <= 0) return '—'
                      const delta = curE1rm - hist
                      if (!Number.isFinite(delta)) return '—'
                      const cls = delta > 0 ? 'text-green-300' : delta < 0 ? 'text-red-300' : 'text-neutral-500'
                      return <span className={cls}>{delta > 0 ? '+' : ''}{delta.toFixed(1)} kg</span>
                    })()}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
