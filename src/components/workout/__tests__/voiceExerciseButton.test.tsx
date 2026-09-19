import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { WorkoutProvider, WorkoutLogsProvider } from '../WorkoutContext'
import VoiceExerciseButton from '../VoiceExerciseButton'
import VoiceDictationPill from '../VoiceDictationPill'

/**
 * O ditado tem DOIS controles desde 19/09/2026, por relato do dono: *"conforme
 * você vai descendo e concluindo as séries o botão fica fixo e vai subindo com
 * a tela"*.
 *
 *  • `VoiceExerciseButton` (cabeçalho do card) → LIGA/DESLIGA o modo;
 *  • `VoiceDictationPill` (dentro do rodapé)   → DITA, e acompanha a rolagem.
 *
 * O que estes casos travam é a separação: o botão não pode voltar a ditar, e a
 * faixa não pode existir com o modo desligado.
 */

const sttState = { gravando: false, erro: '' }
const sttIniciar = vi.fn()
const sttParar = vi.fn()

vi.mock('@/hooks/useSpeechToText', () => ({
  useSpeechToText: () => ({
    gravando: sttState.gravando, parcial: '', erro: sttState.erro,
    permissaoNegada: false, iniciar: sttIniciar, parar: sttParar, limparErro: vi.fn(),
  }),
}))
vi.mock('@/lib/telemetry/userActivity', () => ({ trackUserEvent: vi.fn() }))

afterEach(() => {
  cleanup()
  sttState.gravando = false
  sttState.erro = ''
  sttIniciar.mockClear()
  sttParar.mockClear()
})

const exercicio = (sets: number, name = 'Supino') => ({
  sets, name, setDetails: Array.from({ length: sets }, () => ({})),
})

type Ctx = Record<string, unknown>
const montar = (ui: React.ReactNode, ctx: Ctx = {}, logs: unknown = {}) =>
  render(
    <WorkoutProvider value={{
      session: { startedAt: Date.now() },
      exercises: [exercicio(4)],
      currentExerciseIdx: 0,
      updateLog: vi.fn(),
      vozLigada: false,
      setVozLigada: vi.fn(),
      ...ctx,
    } as never}>
      <WorkoutLogsProvider value={logs as never}>{ui}</WorkoutLogsProvider>
    </WorkoutProvider>,
  )

describe('VoiceExerciseButton — é INTERRUPTOR, não gatilho', () => {
  it('desligado: o rótulo convida a ligar', () => {
    montar(<VoiceExerciseButton />)
    expect(screen.getByLabelText(/ligar o preenchimento por voz/i)).toBeTruthy()
  })

  it('clicar chama setVozLigada(true) — e NUNCA inicia o microfone', () => {
    const setVozLigada = vi.fn()
    montar(<VoiceExerciseButton />, { setVozLigada })

    fireEvent.click(screen.getByRole('button'))

    expect(setVozLigada).toHaveBeenCalledWith(true)
    // A regressão que este caso trava: o botão voltar a ditar do cabeçalho,
    // que é justamente o que some da tela ao rolar.
    expect(sttIniciar).not.toHaveBeenCalled()
  })

  it('ligado: reflete o estado e o clique desliga', () => {
    const setVozLigada = vi.fn()
    montar(<VoiceExerciseButton />, { vozLigada: true, setVozLigada })

    const botao = screen.getByRole('button')
    expect(botao.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(botao)
    expect(setVozLigada).toHaveBeenCalledWith(false)
  })

  it('NÃO aparece na sessão do parceiro (Modo Spotter)', () => {
    montar(<VoiceExerciseButton />, { session: { ehDeOutraPessoa: true } })
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('VoiceDictationPill — o gatilho que acompanha a rolagem', () => {
  it('modo desligado: a faixa não existe', () => {
    montar(<VoiceDictationPill />, { vozLigada: false })
    expect(screen.queryByLabelText(/ditar peso/i)).toBeNull()
  })

  it('modo ligado: mira no exercício da VEZ (e o diz no rótulo acessível)', () => {
    montar(<VoiceDictationPill />, {
      vozLigada: true,
      exercises: [exercicio(4, 'Supino'), exercicio(4, 'Remada')],
      currentExerciseIdx: 1,
    })
    // O alvo é o exercício da vez (índice 1), não o primeiro da lista. Desde
    // 19/09 ele não ocupa a tela em repouso — o dono cortou o texto para o
    // ícone caber na linha do Finalizar —, mas continua no `aria-label`.
    expect(screen.getByLabelText(/vai preencher a 1ª série de Remada/i)).toBeTruthy()
  })

  it('em repouso é SÓ o ícone — sem faixa, sem texto ocupando a tela', () => {
    const { container } = montar(<VoiceDictationPill />, { vozLigada: true })
    // Nada de balão de status antes de o usuário fazer alguma coisa.
    expect(screen.queryByRole('status')).toBeNull()
    // Um controle só (o X de desligar saiu: quem desliga é o mic do card).
    expect(container.querySelectorAll('button')).toHaveLength(1)
  })

  it('a série alvo anda conforme as reps já preenchidas', () => {
    montar(<VoiceDictationPill />, { vozLigada: true }, { '0-0': { reps: '12' } })
    expect(screen.getByLabelText(/vai preencher a 2ª série/i)).toBeTruthy()
  })

  it('tocar no microfone inicia o ditado', () => {
    montar(<VoiceDictationPill />, { vozLigada: true })
    fireEvent.click(screen.getByLabelText(/ditar peso/i))
    expect(sttIniciar).toHaveBeenCalledTimes(1)
  })

  it('gravando: o mesmo botão para', () => {
    sttState.gravando = true
    montar(<VoiceDictationPill />, { vozLigada: true })
    fireEvent.click(screen.getByLabelText(/parar o ditado/i))
    expect(sttParar).toHaveBeenCalledTimes(1)
  })

  it('gravando: avisa em qual série está ouvindo', () => {
    sttState.gravando = true
    montar(<VoiceDictationPill />, { vozLigada: true })
    expect(screen.getByRole('status').textContent).toMatch(/ouvindo/i)
  })
})
