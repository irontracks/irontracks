import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { WorkoutProvider, WorkoutLogsProvider } from '../WorkoutContext'
import VoiceExerciseButton from '../VoiceExerciseButton'

/**
 * Fiação do botão de voz dentro do provider de verdade — mesmo ângulo do
 * `conversaSoDoDonoDaSessao.test.tsx`: "algoritmo certo, ninguém chamando" é
 * o jeito mais comum de um bug passar verde neste repo.
 */

const sttState = { gravando: false, erro: '', permissaoNegada: false }
const sttIniciar = vi.fn()
const sttParar = vi.fn()

vi.mock('@/hooks/useSpeechToText', () => ({
  useSpeechToText: () => ({
    gravando: sttState.gravando,
    parcial: '',
    erro: sttState.erro,
    permissaoNegada: sttState.permissaoNegada,
    iniciar: sttIniciar,
    parar: sttParar,
    limparErro: vi.fn(),
  }),
}))

vi.mock('@/lib/telemetry/userActivity', () => ({ trackUserEvent: vi.fn() }))

afterEach(() => {
  cleanup()
  sttState.gravando = false
  sttState.erro = ''
  sttState.permissaoNegada = false
  sttIniciar.mockClear()
  sttParar.mockClear()
})

const exercicio = (sets: number) => ({ sets, setDetails: Array.from({ length: sets }, () => ({})) })

const montar = (session: unknown, logs: unknown = {}) =>
  render(
    <WorkoutProvider value={{ session, exercises: [exercicio(4)], updateLog: vi.fn() } as never}>
      <WorkoutLogsProvider value={logs as never}>
        <VoiceExerciseButton exIdx={0} />
      </WorkoutLogsProvider>
    </WorkoutProvider>,
  )

describe('VoiceExerciseButton — só existe para o DONO da sessão', () => {
  it('aparece na sessão do dono', () => {
    montar({ startedAt: Date.now() })
    expect(screen.getByRole('button')).toBeTruthy()
  })

  it('NÃO aparece na sessão do parceiro (Modo Spotter)', () => {
    montar({ ehDeOutraPessoa: true })
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('NÃO aparece sem sessão nenhuma', () => {
    montar(null)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('VoiceExerciseButton — diz qual série vai receber, antes de ouvir', () => {
  it('nenhuma série preenchida: aria-label aponta a 1ª', () => {
    montar({ startedAt: Date.now() }, {})
    expect(screen.getByLabelText(/vai preencher a 1ª série/i)).toBeTruthy()
  })

  it('primeira série já tem reps: aria-label aponta a 2ª', () => {
    montar({ startedAt: Date.now() }, { '0-0': { reps: '12' } })
    expect(screen.getByLabelText(/vai preencher a 2ª série/i)).toBeTruthy()
  })
})

describe('VoiceExerciseButton — clique liga/desliga o ditado', () => {
  it('clique parado chama iniciar()', () => {
    montar({ startedAt: Date.now() })
    fireEvent.click(screen.getByRole('button'))
    expect(sttIniciar).toHaveBeenCalledTimes(1)
    expect(sttParar).not.toHaveBeenCalled()
  })

  it('clique gravando chama parar()', () => {
    sttState.gravando = true
    montar({ startedAt: Date.now() })
    fireEvent.click(screen.getByRole('button'))
    expect(sttParar).toHaveBeenCalledTimes(1)
    expect(sttIniciar).not.toHaveBeenCalled()
  })
})
