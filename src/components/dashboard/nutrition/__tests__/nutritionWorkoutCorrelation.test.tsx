import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import NutritionWorkoutCorrelation, { CORRELATION_COLORS } from '../NutritionWorkoutCorrelation'

/**
 * Heatmap Treino × Nutrição — auditoria de design de ago/2026.
 *
 * LIMITE DESTE ARQUIVO: jsdom não pinta nada. Os guards abaixo travam as cores
 * declaradas, a estrutura e o comportamento; que a grade LEIA certo na tela é
 * conferência visual no simulador, não daqui.
 */

/** hex → matiz em graus. Duas cores com o mesmo hue diferem só em brilho. */
const hue = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return 0
  const d = max - min
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}

const distanciaHue = (a: string, b: string): number => {
  const d = Math.abs(hue(a) - hue(b)) % 360
  return d > 180 ? 360 - d : d
}

const HOJE = '2026-08-10'

const dia = (date: string, had_workout: boolean, had_nutrition: boolean, kcal = 0) =>
  ({ date, weekday: new Date(`${date}T12:00:00Z`).getUTCDay(), had_workout, had_nutrition, nutrition_calories: kcal })

const resposta = (days: ReturnType<typeof dia>[], extra: Record<string, number> = {}) => ({
  ok: true,
  days,
  stats: {
    workoutDays: days.filter(d => d.had_workout).length,
    nutritionDays: days.filter(d => d.had_nutrition).length,
    bothDays: days.filter(d => d.had_workout && d.had_nutrition).length,
    workoutWithoutNutrition: days.filter(d => d.had_workout && !d.had_nutrition).length,
    correlationPct: 50,
    ...extra,
  },
})

const montar = async (days: ReturnType<typeof dia>[]) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => resposta(days) }))
  const r = render(<NutritionWorkoutCorrelation />)
  await waitFor(() => expect(screen.getByText(/Treino × Nutrição/)).toBeInTheDocument())
  return r
}

beforeEach(() => {
  vi.setSystemTime(new Date('2026-08-10T18:00:00.000Z')) // 15h em São Paulo
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('cores de estado', () => {
  /**
   * O defeito de origem: "só treino" (#f59e0b) e "só nutrição" (#fbbf24) eram
   * dois âmbares a um degrau de brilho um do outro — fatos OPOSTOS que o usuário
   * não conseguia separar espalhados pela grade.
   */
  it('os três estados se distinguem por MATIZ, não por brilho', () => {
    const { both, workout, nutrition } = CORRELATION_COLORS
    expect(distanciaHue(workout, nutrition)).toBeGreaterThan(40)
    expect(distanciaHue(both, workout)).toBeGreaterThan(40)
    expect(distanciaHue(both, nutrition)).toBeGreaterThan(40)
  })

  it('cada estado desenha a sua própria cor na grade', async () => {
    const { container } = await montar([
      dia('2026-08-06', true, true),
      dia('2026-08-07', true, false),
      dia('2026-08-08', false, true),
      dia('2026-08-09', false, false),
    ])
    const html = container.innerHTML
    const rgb = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
      return `rgb(${r}, ${g}, ${b})`
    }
    expect(html).toContain(rgb(CORRELATION_COLORS.both))
    expect(html).toContain(rgb(CORRELATION_COLORS.workout))
    expect(html).toContain(rgb(CORRELATION_COLORS.nutrition))
  })
})

describe('toque — a informação do dia existe sem mouse', () => {
  /**
   * O detalhe morava num `title=""`: tooltip de mouse, inerte no app nativo.
   * Trinta alvos mudos na plataforma principal.
   */
  it('os dias são botões e não dependem de tooltip', async () => {
    const { container } = await montar([dia('2026-08-09', true, true, 2100)])
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
    expect(container.querySelector('[title]')).toBeNull()
  })

  it('tocar num dia mostra o registro daquele dia', async () => {
    await montar([dia('2026-08-09', true, true, 2100)])
    expect(screen.getByText(/Toque num dia/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /09\/08/ }))
    expect(screen.getByText(/09\/08 — Treino e nutrição · 2100 kcal/)).toBeInTheDocument()
  })

  it('tocar de novo no mesmo dia desfaz a seleção', async () => {
    await montar([dia('2026-08-09', true, false)])
    const celula = screen.getByRole('button', { name: /09\/08/ })
    fireEvent.click(celula)
    expect(screen.getByText(/09\/08 — Só treino/)).toBeInTheDocument()
    fireEvent.click(celula)
    expect(screen.getByText(/Toque num dia/)).toBeInTheDocument()
  })
})

describe('leitura da grade', () => {
  it('hoje é marcado — a grade sozinha não diz onde o tempo termina', async () => {
    const { container } = await montar([dia('2026-08-09', true, true), dia(HOJE, false, false)])
    const marcados = container.querySelectorAll('[aria-current="date"]')
    expect(marcados).toHaveLength(1)
    expect(marcados[0].getAttribute('aria-label')).toContain('10/08')
  })

  it('células de preenchimento não desenham dia nenhum', async () => {
    // 09/08/2026 é domingo (weekday 0): a semana fecha com 6 preenchimentos.
    const { container } = await montar([dia('2026-08-09', true, true)])
    expect(screen.getAllByRole('button')).toHaveLength(1)
    const vazias = container.querySelectorAll('[aria-hidden="true"].aspect-square')
    expect(vazias.length).toBeGreaterThan(0)
    vazias.forEach((el) => expect((el as HTMLElement).style.background).toBe(''))
  })

  it('a legenda explica também o cinza, que é o estado mais comum', async () => {
    await montar([dia('2026-08-09', false, false)])
    expect(screen.getByText('Sem registro')).toBeInTheDocument()
  })
})

describe('números que se explicam', () => {
  it('"treinos com dieta" mostra a razão, não um percentual mudo', async () => {
    await montar([
      dia('2026-08-07', true, true),
      dia('2026-08-08', true, false),
      dia('2026-08-09', true, false),
    ])
    expect(screen.getByText('Treinos com dieta')).toBeInTheDocument()
    expect(screen.getByText('1/3')).toBeInTheDocument()
    expect(screen.queryByText(/Sincronia/i)).toBeNull()
  })
})

describe('acabamento', () => {
  it('sem texto abaixo do contraste mínimo e sem emoji no lugar de ícone', () => {
    const src = readFileSync(join(__dirname, '..', 'NutritionWorkoutCorrelation.tsx'), 'utf8')
    const executavel = src
      .replace(/\/\*[^]*?\*\//g, '')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n')
    // white/20 compõe ~1,6:1 e white/40 ~3:1 sobre o card; o mínimo AA é 4,5:1.
    expect(executavel).not.toMatch(/text-white\/(20|30|40)/)
    expect(executavel, 'emoji renderiza com a fonte do sistema e destoa dos ícones lucide')
      .not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
  })
})
