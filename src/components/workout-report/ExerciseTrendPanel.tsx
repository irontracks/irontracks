'use client'

type ExerciseTrendPanelProps = {
  data: { series: Array<{ name: string; values: number[] }> }
  buildSparklinePoints: (values: number[], width: number, height: number) => string
}

export const ExerciseTrendPanel = ({ data, buildSparklinePoints }: ExerciseTrendPanelProps) => {
  return (
    <div className="mb-8 p-4 rounded-xl border border-neutral-800 bg-neutral-900/60">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Evolução 4 semanas</div>
          <div className="text-lg font-black text-white">Exercícios‑chave</div>
          <div className="text-xs text-neutral-300">Volume semanal por exercício‑chave.</div>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-neutral-950 text-neutral-400 uppercase text-[10px] font-bold">
            <tr>
              <th className="px-3 py-2">Exercício</th>
              <th className="px-3 py-2 text-right">Atual</th>
              <th className="px-3 py-2 text-right">Sparkline</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {data.series.map((row) => {
              const last = row.values[row.values.length - 1] ?? 0
              const points = buildSparklinePoints(row.values, 120, 24)
              return (
                <tr key={`ex-spark-${row.name}`} className="hover:bg-neutral-800/40">
                  <td className="px-3 py-2 font-semibold text-white">{row.name}</td>
                  <td className="px-3 py-2 text-right font-mono text-neutral-200">{Number(last).toLocaleString('pt-BR')}</td>
                  <td className="px-3 py-2 text-right">
                    <svg width="120" height="24" viewBox="0 0 120 24">
                      <polyline fill="none" stroke="#22c55e" strokeWidth="2" points={points} />
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
