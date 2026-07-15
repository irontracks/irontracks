'use client'

import React, { useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import { useWeightTrend } from '@/hooks/useWeightTrend'

/**
 * Card "Tendência de Peso": a curva de peso ao longo do tempo somando as
 * avaliações (medidas formais) com os pesos informados nos check-ins de treino —
 * mais denso que o gráfico de avaliações, sem escrever nada no banco.
 *
 * Registro do Chart.js é herdado do AssessmentHistory (renderizam juntos).
 */
export function WeightTrendCard({ studentId }: { studentId?: string | null }) {
  const { points, loading } = useWeightTrend(studentId)

  const chart = useMemo(() => {
    const labels = points.map((p) =>
      new Date(p.ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }),
    )
    return {
      labels,
      datasets: [
        {
          label: 'Peso (kg)',
          data: points.map((p) => p.weightKg),
          borderColor: '#eab308',
          backgroundColor: 'rgba(234,179,8,0.12)',
          fill: true,
          tension: 0.3,
          // Avaliação = ponto maior/dourado; check-in = menor/neutro.
          pointRadius: points.map((p) => (p.source === 'assessment' ? 5 : 3)),
          pointBackgroundColor: points.map((p) => (p.source === 'assessment' ? '#eab308' : '#a3a3a3')),
          pointBorderColor: points.map((p) => (p.source === 'assessment' ? '#eab308' : '#a3a3a3')),
        },
      ],
    }
  }, [points])

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          afterLabel: (ctx: { dataIndex: number }) =>
            points[ctx.dataIndex]?.source === 'assessment' ? 'Avaliação' : 'Check-in de treino',
        },
      },
    },
    scales: {
      x: { ticks: { color: '#a3a3a3', maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.04)' } },
      y: { ticks: { color: '#a3a3a3' }, grid: { color: 'rgba(255,255,255,0.04)' } },
    },
  }), [points])

  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-baseline justify-between gap-2 mb-4">
        <h3 className="text-sm font-black uppercase tracking-widest text-yellow-500/80">Tendência de Peso</h3>
        <span className="text-[10px] uppercase tracking-widest text-neutral-500">Avaliações + check-ins</span>
      </div>
      <div className="h-72">
        {loading ? (
          <div className="h-full flex items-center justify-center text-neutral-500 text-sm">Carregando…</div>
        ) : points.length >= 2 ? (
          <Line data={chart} options={options as never} />
        ) : (
          <div className="h-full flex items-center justify-center text-neutral-400 text-sm text-center px-6">
            Poucos pontos de peso ainda. Informe o peso no check-in dos treinos para ver a tendência.
          </div>
        )}
      </div>
    </div>
  )
}

export default WeightTrendCard
