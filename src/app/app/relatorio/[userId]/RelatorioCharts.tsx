'use client'

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar, Line, Chart } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
)

const TIP = {
  backgroundColor: 'rgba(9,9,11,0.96)',
  borderColor: 'rgba(250,204,21,0.2)',
  borderWidth: 1,
  titleColor: '#fff',
  bodyColor: 'rgba(255,255,255,0.6)',
  padding: 10,
}
const GC = 'rgba(255,255,255,0.06)'
const TC = 'rgba(255,255,255,0.35)'

interface Props {
  assessments: { date: string; weight: number; bf: number; lean: number }[]
  workoutsByMonth: { mes: string; treinos: number }[]
  nutritionDays: { date: string; calories: number }[]
  nutritionGoalKcal: number
  showEvolution?: boolean
  showFrequency?: boolean
  showNutrition?: boolean
}

export function RelatorioCharts({
  assessments,
  workoutsByMonth,
  nutritionDays,
  nutritionGoalKcal,
  showEvolution = true,
  showFrequency = true,
  showNutrition = true,
}: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {showEvolution && (
        <div style={{ position: 'relative', height: 200 }}>
          <Line
            data={{
              labels: assessments.map((a) => a.date),
              datasets: [
                {
                  label: 'Massa magra (kg)',
                  data: assessments.map((a) => a.lean),
                  borderColor: '#facc15',
                  pointBackgroundColor: '#facc15',
                  backgroundColor: 'transparent',
                  tension: 0.4,
                  pointRadius: 5,
                  yAxisID: 'y',
                },
                {
                  label: 'Peso (kg)',
                  data: assessments.map((a) => a.weight),
                  borderColor: '#60a5fa',
                  pointBackgroundColor: '#60a5fa',
                  backgroundColor: 'transparent',
                  tension: 0.4,
                  pointRadius: 5,
                  borderDash: [4, 3],
                  yAxisID: 'y',
                },
                {
                  label: '% Gordura',
                  data: assessments.map((a) => a.bf),
                  borderColor: '#f87171',
                  pointBackgroundColor: '#f87171',
                  backgroundColor: 'transparent',
                  tension: 0.4,
                  pointRadius: 5,
                  yAxisID: 'y2',
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              interaction: { mode: 'index', intersect: false },
              plugins: { legend: { display: false }, tooltip: TIP },
              scales: {
                y: { ticks: { color: TC, font: { size: 10 } }, grid: { color: GC } },
                y2: {
                  position: 'right',
                  ticks: {
                    color: '#f87171',
                    font: { size: 10 },
                    callback: (v) => v + '%',
                  },
                  grid: { display: false },
                },
              },
            }}
          />
        </div>
      )}

      {showFrequency && (
        <div style={{ position: 'relative', height: 150 }}>
          <Bar
            data={{
              labels: workoutsByMonth.map((w) => w.mes),
              datasets: [
                {
                  data: workoutsByMonth.map((w) => w.treinos),
                  backgroundColor: workoutsByMonth.map((_, i) =>
                    i === workoutsByMonth.length - 1
                      ? 'rgba(250,204,21,0.35)'
                      : '#facc15',
                  ),
                  borderRadius: 8,
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: { ...TIP, callbacks: { label: (c) => c.raw + ' treinos' } },
              },
              scales: {
                x: { ticks: { color: TC, font: { size: 10 } }, grid: { display: false } },
                y: { ticks: { color: TC, font: { size: 10 }, stepSize: 5 }, grid: { color: GC }, min: 0, max: 25 },
              },
            }}
          />
        </div>
      )}

      {showNutrition && (
        <div style={{ position: 'relative', height: 170 }}>
          <Chart
            type="bar"
            data={{
              labels: nutritionDays.map((d) => d.date.slice(5).replace('-', '/')),
              datasets: [
                {
                  type: 'bar' as const,
                  data: nutritionDays.map((d) => d.calories),
                  backgroundColor: nutritionDays.map((d) =>
                    d.calories < 1500
                      ? 'rgba(239,68,68,0.45)'
                      : d.calories > 3200
                        ? 'rgba(249,115,22,0.65)'
                        : 'rgba(250,204,21,0.45)',
                  ),
                  borderRadius: 6,
                },
                {
                  type: 'line' as const,
                  data: nutritionDays.map(() => nutritionGoalKcal),
                  borderColor: 'rgba(239,68,68,0.6)',
                  borderDash: [4, 4],
                  pointRadius: 0,
                  backgroundColor: 'transparent',
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false }, tooltip: TIP },
              scales: {
                x: { ticks: { color: TC, font: { size: 9 } }, grid: { display: false } },
                y: { ticks: { color: TC, font: { size: 10 } }, grid: { color: GC }, min: 0, max: 4000 },
              },
            }}
          />
        </div>
      )}
    </div>
  )
}
