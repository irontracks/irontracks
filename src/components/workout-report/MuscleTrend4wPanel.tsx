'use client'

type MuscleTrend4wPanelProps = {
  data: { series: Record<string, number[]> }
  muscleById: Record<string, { label?: string }>
  buildSparklinePoints: (values: number[], width: number, height: number) => string
}

export const MuscleTrend4wPanel = ({ data, muscleById, buildSparklinePoints }: MuscleTrend4wPanelProps) => {
  return (
    <div className="mb-8 p-4 rounded-xl border border-neutral-800 bg-neutral-900/60">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Histórico 4 semanas</div>
          <div className="text-lg font-black text-white">Sparklines por músculo</div>
          <div className="text-xs text-neutral-300">Tendência das últimas 4 semanas (sets equivalentes).</div>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-neutral-950 text-neutral-400 uppercase text-[10px] font-bold">
            <tr>
              <th className="px-3 py-2">Músculo</th>
              <th className="px-3 py-2 text-right">Atual</th>
              <th className="px-3 py-2 text-right">Sparkline</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {Object.entries(data.series)
              .map(([id, values]) => ({ id, values }))
              .map((row) => {
                const last = row.values[row.values.length - 1] ?? 0
                return { ...row, last: Number(last) || 0 }
              })
              .sort((a, b) => b.last - a.last)
              .slice(0, 6)
              .map((row) => {
                const label = String(muscleById[row.id]?.label || row.id)
                const points = buildSparklinePoints(row.values, 120, 24)
                return (
                  <tr key={`spark-${row.id}`} className="hover:bg-neutral-800/40">
                    <td className="px-3 py-2 font-semibold text-white">{label}</td>
                    <td className="px-3 py-2 text-right font-mono text-neutral-200">{row.last.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right">
                      <svg width="120" height="24" viewBox="0 0 120 24">
                        <polyline fill="none" stroke="#eab308" strokeWidth="2" points={points} />
                      </svg>
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
