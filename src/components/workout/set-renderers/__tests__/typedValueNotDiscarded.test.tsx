import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NormalSet } from '../normalSet'

/**
 * Guard: valor DIGITADO não pode ser descartado por um re-render que chega antes
 * da gravação voltar pelo estado do React.
 *
 * INCIDENTE (Sentry `workout.input.typed-value-discarded`, 8 eventos em 24 h no
 * iPhone do dono, 2026-07-24): o usuário digitava o RPE e ele sumia. A guarda
 * anti-descarte do `useInputField` só valia DEPOIS de um blur:
 *
 *     if (localValue && !externalValue && Date.now() - blurredAtRef.current < 2000)
 *
 * Com `blurredAtRef` ainda 0 (nenhum blur), `Date.now() - 0` é um número gigante,
 * a guarda não pegava e o valor ia pro lixo. A telemetria denunciou exatamente
 * isso: `sinceBlurMs` chegou como epoch inteiro (1784937586455) e `focused:false`.
 * Todos os 8 eventos eram unilaterais (L_/R_), onde o efeito de re-sync do autoload
 * dispara um updateLog extra logo após a tecla.
 *
 * INVARIANTE: digitou e o externo ainda voltou vazio (gravação em trânsito) → o
 * valor digitado PERMANECE na tela, mesmo sem nunca ter havido blur.
 */
vi.mock('@/components/ui/HelpHint', () => ({ HelpHint: () => null }))
vi.mock('@/lib/logger', () => ({ logWarnRemote: vi.fn() }))

const updateLog = vi.fn()
let logStore: Record<string, unknown> = {}

const ctx = {
  get getLog() { return () => logStore },
  updateLog,
  getPlanConfig: () => null,
  getPlannedSet: () => null,
  startTimer: vi.fn(),
  openNotesKeys: new Set<string>(),
  toggleNotes: vi.fn(),
  reportHistory: null,
  deloadSuggestions: {},
  autoLoadEnabled: false,
  autoLoadSuggestions: {},
  updateSetType: vi.fn(),
  collapsed: new Set<number>(),
  setCollapsed: vi.fn(),
  exercises: [],
}
vi.mock('../../WorkoutContext', () => ({ useWorkoutContext: () => ctx }))

const ex = { name: 'Rosca direta', method: 'Normal', sets: 3, restTime: 60 }

beforeEach(() => {
  updateLog.mockClear()
  logStore = {}
})

describe('useInputField — valor digitado sobrevive a re-render com externo vazio', () => {
  it('RPE digitado PERMANECE quando o log volta a vazio (sem blur nenhum)', () => {
    const { rerender } = render(<NormalSet ex={ex as never} exIdx={0} setIdx={0} setsCount={3} />)
    const rpe = screen.getByLabelText('RPE – série 1') as HTMLInputElement

    // Digita — NÃO dá blur (foi exatamente o caso capturado no Sentry:
    // `focused:false` e `sinceBlurMs` denunciando blurredAtRef ainda zerado).
    fireEvent.change(rpe, { target: { value: '7' } })
    expect(rpe.value).toBe('7')

    // A gravação volta pelo estado do React…
    logStore = { rpe: '7' }
    rerender(<NormalSet ex={{ ...ex } as never} exIdx={0} setIdx={0} setsCount={3} />)

    // …e então um updateLog vizinho (no device: o re-sync do autoload) devolve o
    // log SEM este campo. É aqui que o efeito rodava e jogava fora o que foi digitado.
    logStore = {}
    rerender(<NormalSet ex={{ ...ex } as never} exIdx={0} setIdx={0} setsCount={3} />)

    // O valor digitado tem que continuar lá — antes virava '' em silêncio.
    expect((screen.getByLabelText('RPE – série 1') as HTMLInputElement).value).toBe('7')
  })

  it('valor externo legítimo (vindo do log) ainda é refletido', () => {
    const { rerender } = render(<NormalSet ex={ex as never} exIdx={0} setIdx={0} setsCount={3} />)
    // Sem digitação local: uma mudança externa (ex.: restaurar sessão) deve aparecer.
    // `ex` novo quebra o React.memo do NormalSet — senão o re-render nem acontece.
    logStore = { rpe: '9' }
    rerender(<NormalSet ex={{ ...ex } as never} exIdx={0} setIdx={0} setsCount={3} />)
    expect((screen.getByLabelText('RPE – série 1') as HTMLInputElement).value).toBe('9')
  })
})
