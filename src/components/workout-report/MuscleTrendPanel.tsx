'use client'

type MuscleTrendPanelProps = {
  data: { current: Record<string, number>; previous: Record<string, number> }
  muscleById: Record<string, { label?: string }>
}

export const MuscleTrendPanel = ({ data, muscleById }: MuscleTrendPanelProps) => {
  return (
    <div className="mb-8 p-4 rounded-xl border border-neutral-800 bg-neutral-900/60">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Tendência semanal por músculo</div>
          <div className="text-lg font-black text-white">Comparativo semanal</div>
          <div className="text-xs text-neutral-300">Top músculos da semana vs semana anterior.</div>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-neutral-950 text-neutral-400 uppercase text-[10px] font-bold">
            <tr>
              <th className="px-3 py-2">Músculo</th>
              <th className="px-3 py-2 text-right">Semana atual</th>
              <th className="px-3 py-2 text-right">Semana anterior</th>
              <th className="px-3 py-2 text-right">Δ Sets</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {Object.entries(data.current)
              .map(([id, sets]) => ({ id, sets: Number(sets || 0), prev: Number(data.previous?.[id] || 0) }))
              .sort((a, b) => b.sets - a.sets)
              .slice(0, 6)
              .map((row) => {
                const delta = row.sets - row.prev
                const label = String(muscleById[row.id]?.label || row.id)
                const deltaLabel = `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`
                const deltaClass = delta < 0 ? 'text-red-300' : 'text-emerald-300'
                return (
                  <tr key={row.id} className="hover:bg-neutral-800/40">
                    <td className="px-3 py-2 font-semibold text-white">{label}</td>
                    <td className="px-3 py-2 text-right font-mono text-neutral-200">{row.sets.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right font-mono text-neutral-400">{row.prev.toFixed(1)}</td>
                    <td className={`px-3 py-2 text-right font-mono ${deltaClass}`}>{deltaLabel}</td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
